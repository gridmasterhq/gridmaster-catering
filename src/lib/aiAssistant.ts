import { supabase } from './supabase'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

const AI_ASSISTANT_SYSTEM_PROMPT =
  'You are an AI assistant for a catering staffing coordinator using GridMaster HQ. Answer questions about staff availability, scheduling, and operations. Be direct and operational. When listing staff, always include their primary role. Format lists with line breaks between items. Keep answers under 200 words.'

const STAFF_COUNT_NOUNS: Record<string, string> = {
  captain: 'captain',
  captains: 'captain',
  bartender: 'bartender',
  bartenders: 'bartender',
  server: 'server',
  servers: 'server',
}

export interface StaffDirectoryEntry {
  phone: string
  displayName: string
  legalName: string
  primaryRole: string | null
}

export interface AssistantAnswer {
  source: 'db' | 'ai'
  text: string
}

export interface AssistantContext {
  roleCounts: Record<string, number>
  upcomingEvents: Array<{
    event_name: string
    event_date: string
    assignment_status_counts: Record<string, number>
  }>
  staffDirectory: StaffDirectoryEntry[]
  dbPrefetch: Record<string, unknown>
}

function formatRoleLabel(roleName: string): string {
  return roleName
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function pluralizeRoleLabel(role: string, count: number): string {
  const label = formatRoleLabel(role)
  if (count === 1) {
    return label.toLowerCase()
  }
  if (label.toLowerCase() === 'bartender') {
    return 'bartenders'
  }
  if (label.toLowerCase() === 'server') {
    return 'servers'
  }
  if (label.toLowerCase() === 'captain') {
    return 'captains'
  }
  return `${label.toLowerCase()}s`
}

function classifyStaffCountQuestion(question: string): string | null {
  const lower = question.toLowerCase()
  if (!lower.includes('how many')) {
    return null
  }

  for (const [token, role] of Object.entries(STAFF_COUNT_NOUNS)) {
    const pattern = new RegExp(`\\b${token}\\b`, 'i')
    if (pattern.test(lower)) {
      return role
    }
  }

  if (/\bstaff\b/i.test(lower)) {
    return '__all_staff__'
  }

  return null
}

function isWhoWorkedQuestion(question: string): boolean {
  return /who worked/i.test(question)
}

function isAvailabilityStaleQuestion(question: string): boolean {
  const lower = question.toLowerCase()
  return (
    (lower.includes("haven't updated") ||
      lower.includes('have not updated') ||
      lower.includes('has not updated') ||
      lower.includes("hasn't updated")) &&
    lower.includes('availability')
  )
}

function extractWhoWorkedSearchTerm(question: string): string {
  const match = question.match(
    /who worked\s+(?:the\s+)?(.+?)(?:\?|$)/i,
  )
  return match?.[1]?.trim() ?? question.replace(/who worked/i, '').trim()
}

async function getOrganizationId(): Promise<string | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const orgId = user?.user_metadata?.organization_id
  return typeof orgId === 'string' && orgId.trim() ? orgId.trim() : null
}

async function answerStaffCountQuestion(
  orgId: string,
  roleKey: string,
): Promise<AssistantAnswer> {
  if (roleKey === '__all_staff__') {
    const { count, error } = await supabase
      .from('staff')
      .select('*', { count: 'exact', head: true })
      .eq('organization_id', orgId)
      .eq('status', 'active')

    if (error) {
      throw error
    }

    const total = count ?? 0
    return {
      source: 'db',
      text: `You have ${total} active staff member${total === 1 ? '' : 's'} on your roster.`,
    }
  }

  const { data, error } = await supabase
    .from('staff_roles')
    .select('staff_phone')
    .eq('organization_id', orgId)
    .eq('role_name', roleKey)

  if (error) {
    throw error
  }

  const uniqueStaff = new Set(
    (data ?? [])
      .map((row) => (typeof row.staff_phone === 'string' ? row.staff_phone : ''))
      .filter(Boolean),
  )
  const count = uniqueStaff.size
  const roleLabel = pluralizeRoleLabel(roleKey, count)

  return {
    source: 'db',
    text: `You have ${count} ${roleLabel} on your roster.`,
  }
}

async function answerWhoWorkedQuestion(
  orgId: string,
  question: string,
): Promise<AssistantAnswer> {
  const searchTerm = extractWhoWorkedSearchTerm(question)
  const lower = searchTerm.toLowerCase()

  let eventsQuery = supabase
    .from('events')
    .select('id, event_name, event_date')
    .eq('organization_id', orgId)

  const namePart = searchTerm
    .replace(/\blast\s+december\b/gi, '')
    .replace(/\bdecember\b/gi, '')
    .replace(/\b(20\d{2})\b/g, '')
    .replace(/\bthe\b/gi, '')
    .trim()

  if (lower.includes('december')) {
    const yearMatch = lower.match(/\b(20\d{2})\b/)
    const year = yearMatch
      ? Number.parseInt(yearMatch[1], 10)
      : new Date().getFullYear() - 1
    eventsQuery = eventsQuery
      .gte('event_date', `${year}-12-01`)
      .lte('event_date', `${year}-12-31`)
  }

  if (namePart) {
    eventsQuery = eventsQuery.ilike('event_name', `%${namePart}%`)
  } else if (searchTerm && !lower.includes('december')) {
    eventsQuery = eventsQuery.ilike('event_name', `%${searchTerm}%`)
  }

  const { data: events, error: eventsError } = await eventsQuery
    .order('event_date', { ascending: false })
    .limit(5)

  if (eventsError) {
    throw eventsError
  }

  if (!events?.length) {
    return {
      source: 'db',
      text: `I couldn't find an event matching "${searchTerm || question}".`,
    }
  }

  const targetEvent = events[0]
  const eventId = targetEvent.id as string
  const eventName =
    typeof targetEvent.event_name === 'string'
      ? targetEvent.event_name
      : 'the event'
  const eventDate =
    typeof targetEvent.event_date === 'string' ? targetEvent.event_date : ''

  const { data: assignments, error: assignmentsError } = await supabase
    .from('event_staff_assignments')
    .select('staff_phone, role, status')
    .eq('organization_id', orgId)
    .eq('event_id', eventId)

  if (assignmentsError) {
    throw assignmentsError
  }

  const phones = [
    ...new Set(
      (assignments ?? [])
        .map((row) =>
          typeof row.staff_phone === 'string' ? row.staff_phone : '',
        )
        .filter(Boolean),
    ),
  ]

  if (phones.length === 0) {
    return {
      source: 'db',
      text: `No staff assignments were found for ${eventName}${eventDate ? ` (${eventDate})` : ''}.`,
    }
  }

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('phone, legal_name, display_name')
    .eq('organization_id', orgId)
    .in('phone', phones)

  if (staffError) {
    throw staffError
  }

  const { data: roleRows, error: rolesError } = await supabase
    .from('staff_roles')
    .select('staff_phone, role_name, is_primary')
    .eq('organization_id', orgId)
    .in('staff_phone', phones)

  if (rolesError) {
    throw rolesError
  }

  const primaryRoleByPhone = new Map<string, string>()
  for (const row of roleRows ?? []) {
    if (
      row.is_primary &&
      typeof row.staff_phone === 'string' &&
      typeof row.role_name === 'string'
    ) {
      primaryRoleByPhone.set(row.staff_phone, row.role_name)
    }
  }

  const lines = (staffRows ?? []).map((row) => {
    const phone = typeof row.phone === 'string' ? row.phone : ''
    const name =
      (typeof row.display_name === 'string' && row.display_name.trim()) ||
      (typeof row.legal_name === 'string' && row.legal_name.trim()) ||
      phone
    const role = primaryRoleByPhone.get(phone)
    const assignment = (assignments ?? []).find(
      (entry) => entry.staff_phone === phone,
    )
    const workedRole =
      typeof assignment?.role === 'string' ? assignment.role : role
    return workedRole
      ? `${name} (${formatRoleLabel(workedRole)})`
      : name
  })

  return {
    source: 'db',
    text: `Staff who worked ${eventName}${eventDate ? ` on ${eventDate}` : ''}:\n${lines.join('\n')}`,
  }
}

async function answerAvailabilityStaleQuestion(
  orgId: string,
): Promise<AssistantAnswer> {
  const thirtyDaysAgo = new Date()
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)

  const { data: staffRows, error: staffError } = await supabase
    .from('staff')
    .select('phone, legal_name, display_name')
    .eq('organization_id', orgId)
    .eq('status', 'active')

  if (staffError) {
    throw staffError
  }

  const { data: availabilityRows, error: availabilityError } = await supabase
    .from('staff_weekly_availability')
    .select('staff_phone, last_updated_at')
    .eq('organization_id', orgId)

  if (availabilityError) {
    throw availabilityError
  }

  const latestUpdateByPhone = new Map<string, string>()
  for (const row of availabilityRows ?? []) {
    const phone =
      typeof row.staff_phone === 'string' ? row.staff_phone : null
    const updatedAt =
      typeof row.last_updated_at === 'string' ? row.last_updated_at : null
    if (!phone || !updatedAt) {
      continue
    }
    const existing = latestUpdateByPhone.get(phone)
    if (!existing || new Date(updatedAt) > new Date(existing)) {
      latestUpdateByPhone.set(phone, updatedAt)
    }
  }

  const staleStaff = (staffRows ?? []).filter((row) => {
    const phone = typeof row.phone === 'string' ? row.phone : ''
    if (!phone) {
      return false
    }
    const lastUpdated = latestUpdateByPhone.get(phone)
    if (!lastUpdated) {
      return true
    }
    return new Date(lastUpdated) < thirtyDaysAgo
  })

  if (staleStaff.length === 0) {
    return {
      source: 'db',
      text: 'All active staff have updated their availability within the last 30 days.',
    }
  }

  const names = staleStaff.map((row) => {
    const display =
      (typeof row.display_name === 'string' && row.display_name.trim()) ||
      (typeof row.legal_name === 'string' && row.legal_name.trim()) ||
      (typeof row.phone === 'string' ? row.phone : 'Staff member')
    return display
  })

  return {
    source: 'db',
    text: `${staleStaff.length} staff member${staleStaff.length === 1 ? '' : 's'} haven't updated availability this month:\n${names.join('\n')}`,
  }
}

export async function buildAssistantContext(
  orgId: string,
  dbPrefetch: Record<string, unknown> = {},
): Promise<AssistantContext> {
  const today = new Date()
  const thirtyDaysOut = new Date(today)
  thirtyDaysOut.setDate(thirtyDaysOut.getDate() + 30)
  const todayIso = today.toISOString().slice(0, 10)
  const endIso = thirtyDaysOut.toISOString().slice(0, 10)

  const [rolesResult, eventsResult, staffResult, assignmentsResult] =
    await Promise.all([
      supabase
        .from('staff_roles')
        .select('staff_phone, role_name, is_primary')
        .eq('organization_id', orgId),
      supabase
        .from('events')
        .select('id, event_name, event_date')
        .eq('organization_id', orgId)
        .gte('event_date', todayIso)
        .lte('event_date', endIso)
        .order('event_date', { ascending: true }),
      supabase
        .from('staff')
        .select('phone, legal_name, display_name')
        .eq('organization_id', orgId)
        .eq('status', 'active'),
      supabase
        .from('event_staff_assignments')
        .select('event_id, status')
        .eq('organization_id', orgId),
    ])

  const roleCounts: Record<string, number> = {}
  for (const row of rolesResult.data ?? []) {
    const role =
      typeof row.role_name === 'string' ? row.role_name.trim().toLowerCase() : ''
    const phone =
      typeof row.staff_phone === 'string' ? row.staff_phone : ''
    if (!role || !phone) {
      continue
    }
    if (!roleCounts[role]) {
      roleCounts[role] = 0
    }
    roleCounts[role] += 1
  }

  const assignmentCountsByEvent = new Map<string, Record<string, number>>()
  for (const row of assignmentsResult.data ?? []) {
    const eventId = typeof row.event_id === 'string' ? row.event_id : ''
    const status = typeof row.status === 'string' ? row.status : 'unknown'
    if (!eventId) {
      continue
    }
    const existing = assignmentCountsByEvent.get(eventId) ?? {}
    existing[status] = (existing[status] ?? 0) + 1
    assignmentCountsByEvent.set(eventId, existing)
  }

  const upcomingEvents = (eventsResult.data ?? []).map((row) => ({
    event_name:
      typeof row.event_name === 'string' ? row.event_name : 'Untitled event',
    event_date:
      typeof row.event_date === 'string' ? row.event_date : '',
    assignment_status_counts:
      assignmentCountsByEvent.get(row.id as string) ?? {},
  }))

  const primaryRoleByPhone = new Map<string, string>()
  for (const row of rolesResult.data ?? []) {
    if (
      row.is_primary &&
      typeof row.staff_phone === 'string' &&
      typeof row.role_name === 'string'
    ) {
      primaryRoleByPhone.set(row.staff_phone, row.role_name)
    }
  }

  const staffDirectory: StaffDirectoryEntry[] = (staffResult.data ?? []).map(
    (row) => {
      const phone = typeof row.phone === 'string' ? row.phone : ''
      const legalName =
        typeof row.legal_name === 'string' ? row.legal_name : ''
      const displayName =
        typeof row.display_name === 'string' ? row.display_name : ''
      return {
        phone,
        displayName,
        legalName,
        primaryRole: primaryRoleByPhone.get(phone) ?? null,
      }
    },
  )

  return {
    roleCounts,
    upcomingEvents,
    staffDirectory,
    dbPrefetch,
  }
}

async function callAnthropicApi(
  question: string,
  context: AssistantContext,
): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Missing VITE_ANTHROPIC_API_KEY')
  }

  const userPrompt = `${question}\n\nContext:\n${JSON.stringify(
    {
      role_counts: context.roleCounts,
      upcoming_events_next_30_days: context.upcomingEvents,
      db_prefetch: context.dbPrefetch,
    },
    null,
    2,
  )}`

  const response = await fetch(ANTHROPIC_API_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 800,
      system: AI_ASSISTANT_SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userPrompt }],
    }),
  })

  if (!response.ok) {
    const errorBody = await response.text()
    throw new Error(errorBody || `Anthropic API error: ${response.status}`)
  }

  const payload = (await response.json()) as {
    content?: Array<{ type: string; text?: string }>
  }

  const textBlock = payload.content?.find(
    (block) => block.type === 'text' && typeof block.text === 'string',
  )

  if (!textBlock?.text) {
    throw new Error('No text content in Anthropic response')
  }

  return textBlock.text.trim()
}

export function isDbOnlyQuestion(question: string): boolean {
  return (
    classifyStaffCountQuestion(question) != null ||
    isWhoWorkedQuestion(question) ||
    isAvailabilityStaleQuestion(question)
  )
}

export async function answerAssistantQuestion(
  question: string,
): Promise<{ answer: AssistantAnswer; context: AssistantContext }> {
  const orgId = await getOrganizationId()
  if (!orgId) {
    throw new Error('Missing organization_id')
  }

  const staffCountRole = classifyStaffCountQuestion(question)
  if (staffCountRole) {
    const answer = await answerStaffCountQuestion(orgId, staffCountRole)
    const context = await buildAssistantContext(orgId, {
      staff_count_role: staffCountRole,
      answer: answer.text,
    })
    return { answer, context }
  }

  if (isWhoWorkedQuestion(question)) {
    const answer = await answerWhoWorkedQuestion(orgId, question)
    const context = await buildAssistantContext(orgId, {
      who_worked_query: question,
      answer: answer.text,
    })
    return { answer, context }
  }

  if (isAvailabilityStaleQuestion(question)) {
    const answer = await answerAvailabilityStaleQuestion(orgId)
    const context = await buildAssistantContext(orgId, {
      availability_stale_query: true,
      answer: answer.text,
    })
    return { answer, context }
  }

  const context = await buildAssistantContext(orgId)
  const text = await callAnthropicApi(question, context)
  return {
    answer: { source: 'ai', text },
    context,
  }
}

export function matchStaffNamesInAnswer(
  text: string,
  staffDirectory: StaffDirectoryEntry[],
): Array<{ start: number; end: number; phone: string; label: string }> {
  const matches: Array<{
    start: number
    end: number
    phone: string
    label: string
  }> = []

  const candidates = staffDirectory.flatMap((entry) => {
    const names = new Set<string>()
    if (entry.displayName.trim()) {
      names.add(entry.displayName.trim())
    }
    if (entry.legalName.trim()) {
      names.add(entry.legalName.trim())
    }
    return [...names].map((name) => ({ name, phone: entry.phone }))
  })

  candidates.sort((left, right) => right.name.length - left.name.length)

  const usedRanges: Array<{ start: number; end: number }> = []

  for (const candidate of candidates) {
    const pattern = new RegExp(
      `\\b${candidate.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`,
      'gi',
    )
    let match: RegExpExecArray | null = pattern.exec(text)
    while (match) {
      const start = match.index
      const end = start + match[0].length
      const overlaps = usedRanges.some(
        (range) => start < range.end && end > range.start,
      )
      if (!overlaps) {
        matches.push({
          start,
          end,
          phone: candidate.phone,
          label: match[0],
        })
        usedRanges.push({ start, end })
      }
      match = pattern.exec(text)
    }
  }

  return matches.sort((left, right) => left.start - right.start)
}
