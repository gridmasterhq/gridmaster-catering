import {
  type FormEvent,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react'
import { IconBrain, IconCheck } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

const SUMMARY_SYSTEM_PROMPT =
  'You are an AI assistant for a catering and hospitality staffing coordinator. Generate a structured operational summary of a staff member based on the data provided. Return ONLY valid JSON with no markdown, no code fences, no preamble, no trailing text. The JSON must have exactly these six keys: strengths, scheduling_notes, times_logged, compliance_status, development, watch_notes. Each value is a plain text string of 2-4 sentences. Be direct and operational — this is a working tool not a formal report. Draw heavily on captain notes and ratings to surface patterns and specific observations. If a field has no notable information write \'Nothing to note at this time.\''

const FOLLOW_UP_SYSTEM_PROMPT =
  "You are a staffing coordinator assistant. You have already generated a summary for a staff member. Answer the coordinator's follow-up question directly and concisely in 2-4 sentences. Use the staff data context provided."

const INTRO_TEXT =
  "You can't be everywhere at once — and with a busy roster, it's impossible to read every captain's rating and comment that comes in. This AI summary helps you better understand each team member: where they shine, where they might need additional training, and who is ready to grow within your organization."

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

export interface StaffProfileAISummaryTabProps {
  staffPhone: string
  organizationId: string
  staffName: string
  staffFirstName: string
}

interface SummaryJson {
  strengths: string
  scheduling_notes: string
  times_logged: string
  compliance_status: string
  development: string
  watch_notes: string
}

interface SavedSummaryRow {
  summary: SummaryJson
  generatedAt: string
  inputSnapshot: Record<string, unknown>
}

interface FollowUpMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  status: 'loading' | 'done' | 'error'
}

const SUMMARY_CARDS: Array<{ key: keyof SummaryJson; label: string }> = [
  { key: 'strengths', label: 'STRENGTHS' },
  { key: 'scheduling_notes', label: 'SCHEDULING' },
  { key: 'times_logged', label: 'TIMES LOGGED' },
  { key: 'compliance_status', label: 'COMPLIANCE' },
  { key: 'development', label: 'DEVELOPMENT' },
  { key: 'watch_notes', label: 'WATCH NOTES' },
]

function createMessageId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function formatGeneratedDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function formatRatingDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatRoleLabel(role: string): string {
  return role
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function stripMarkdownFences(text: string): string {
  return text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim()
}

function isSummaryJson(value: unknown): value is SummaryJson {
  if (!value || typeof value !== 'object') {
    return false
  }
  const record = value as Record<string, unknown>
  return SUMMARY_CARDS.every(
    ({ key }) => typeof record[key] === 'string',
  )
}

function watchNotesIsClear(text: string): boolean {
  return text.toLowerCase().includes('nothing to note')
}

async function callAnthropicApi(
  system: string,
  userContent: string,
  maxTokens: number,
): Promise<string> {
  const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
  if (!apiKey) {
    throw new Error('Missing VITE_ANTHROPIC_API_KEY')
  }

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
      max_tokens: maxTokens,
      system,
      messages: [{ role: 'user', content: userContent }],
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

async function fetchStaffSummaryContext(
  staffPhone: string,
  organizationId: string,
): Promise<Record<string, unknown>> {
  const todayIso = new Date().toISOString().slice(0, 10)
  const yearStart = `${new Date().getFullYear()}-01-01`

  const [
    staffResult,
    rolesResult,
    allTimeCountResult,
    ytdCountResult,
    futureAssignmentsResult,
    timesSummaryResult,
    ratingsResult,
    certificationsResult,
    incompleteCoursesResult,
    weeklyAvailabilityResult,
    blackoutsResult,
    actionItemsResult,
  ] = await Promise.all([
    supabase
      .from('staff')
      .select(
        'legal_name, display_name, basic_availability, coordinator_notes, average_rating, rating_count, experience_rating',
      )
      .eq('phone', staffPhone)
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('staff_roles')
      .select('role_name, is_primary')
      .eq('staff_phone', staffPhone)
      .eq('organization_id', organizationId),
    supabase
      .from('event_staff_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('staff_phone', staffPhone)
      .eq('status', 'confirmed'),
    supabase
      .from('event_staff_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('staff_phone', staffPhone)
      .eq('status', 'confirmed')
      .gte('confirmed_at', yearStart),
    supabase
      .from('event_staff_assignments')
      .select('role, events!inner(event_date)')
      .eq('organization_id', organizationId)
      .eq('staff_phone', staffPhone)
      .eq('status', 'confirmed')
      .gt('events.event_date', todayIso)
      .order('event_date', { referencedTable: 'events', ascending: true })
      .limit(10),
    supabase
      .from('staff_times_summary')
      .select('role, total_minutes_alltime, total_minutes_ytd, pct_of_total')
      .eq('staff_phone', staffPhone)
      .eq('organization_id', organizationId),
    supabase
      .from('ratings')
      .select(
        'stars, notes, role_at_event, section_name, rater_role, is_disputed, dispute_reason, created_at',
      )
      .eq('staff_phone', staffPhone)
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('staff_certifications')
      .select('cert_type, expiry_date, is_verified, is_alcohol_cert')
      .eq('staff_phone', staffPhone)
      .eq('organization_id', organizationId),
    supabase
      .from('course_completions')
      .select('course_template_id, completed_at, course_templates(course_name)')
      .eq('staff_phone', staffPhone)
      .eq('organization_id', organizationId)
      .is('completed_at', null),
    supabase
      .from('staff_weekly_availability')
      .select('day_of_week, status, available_after_time')
      .eq('staff_phone', staffPhone)
      .eq('organization_id', organizationId),
    supabase
      .from('staff_availability')
      .select('vacation_start, vacation_end')
      .eq('staff_phone', staffPhone)
      .eq('organization_id', organizationId)
      .eq('record_type', 'vacation_block')
      .gte('vacation_start', todayIso)
      .order('vacation_start', { ascending: true })
      .limit(10),
    supabase
      .from('action_items')
      .select('category, title, description')
      .eq('entity_id', staffPhone)
      .eq('organization_id', organizationId)
      .is('resolved_at', null),
  ])

  const criticalErrors = [
    staffResult.error,
    rolesResult.error,
    allTimeCountResult.error,
    futureAssignmentsResult.error,
    timesSummaryResult.error,
    ratingsResult.error,
    certificationsResult.error,
    incompleteCoursesResult.error,
    weeklyAvailabilityResult.error,
    blackoutsResult.error,
    actionItemsResult.error,
  ].filter(Boolean)

  if (criticalErrors.length > 0) {
    console.error('[StaffProfileAISummary] data fetch failed', criticalErrors)
    throw new Error('Failed to load staff data')
  }

  let ytdConfirmedCount = 0
  if (!ytdCountResult.error) {
    ytdConfirmedCount = ytdCountResult.count ?? 0
  } else {
    const ytdFallback = await supabase
      .from('event_staff_assignments')
      .select('id, events!inner(event_date)', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('staff_phone', staffPhone)
      .eq('status', 'confirmed')
      .gte('events.event_date', yearStart)
    if (ytdFallback.error) {
      console.error(
        '[StaffProfileAISummary] YTD event count failed',
        ytdFallback.error,
      )
      throw new Error('Failed to load staff data')
    }
    ytdConfirmedCount = ytdFallback.count ?? 0
  }

  const timesRows = timesSummaryResult.data ?? []
  const timesSummaryText =
    timesRows.length === 0
      ? 'No check-in/check-out data yet — will populate as events are worked.'
      : timesRows
          .map((row) => {
            const role =
              typeof row.role === 'string' ? formatRoleLabel(row.role) : 'Role'
            const allTime =
              typeof row.total_minutes_alltime === 'number'
                ? row.total_minutes_alltime
                : 0
            const ytd =
              typeof row.total_minutes_ytd === 'number'
                ? row.total_minutes_ytd
                : 0
            const pct =
              typeof row.pct_of_total === 'number' ? row.pct_of_total : 0
            return `${role}: ${allTime} min all-time, ${ytd} min YTD (${pct}% of total)`
          })
          .join('\n')

  const captainNotes = (ratingsResult.data ?? []).map((row) => {
    const date =
      typeof row.created_at === 'string'
        ? formatRatingDate(row.created_at)
        : 'Unknown date'
    const role =
      typeof row.role_at_event === 'string'
        ? formatRoleLabel(row.role_at_event)
        : 'Staff'
    const stars = typeof row.stars === 'number' ? row.stars : 0
    const notes =
      typeof row.notes === 'string' && row.notes.trim()
        ? row.notes.trim()
        : 'No notes'
    const disputed = Boolean(row.is_disputed)
    const disputeReason =
      typeof row.dispute_reason === 'string' ? row.dispute_reason.trim() : ''
    const section =
      typeof row.section_name === 'string' ? row.section_name.trim() : ''
    const raterRole =
      typeof row.rater_role === 'string' ? row.rater_role.trim() : ''

    let line = `[${date}] ${role} ${stars}/4 stars — ${notes}`
    if (section) {
      line += ` (Section: ${section})`
    }
    if (raterRole) {
      line += ` [Rater: ${raterRole}]`
    }
    if (disputed) {
      line += disputeReason
        ? ` [DISPUTED: ${disputeReason}]`
        : ' [DISPUTED]'
    }
    return line
  })

  const futureAssignments = (futureAssignmentsResult.data ?? []).map((row) => {
    const events = row.events as { event_date?: string } | { event_date?: string }[] | null
    const eventDate = Array.isArray(events)
      ? events[0]?.event_date
      : events?.event_date
    const role = typeof row.role === 'string' ? formatRoleLabel(row.role) : 'Staff'
    return `${eventDate ?? 'TBD'} — ${role}`
  })

  const weeklyAvailability = (weeklyAvailabilityResult.data ?? []).map((row) => {
    const dayIndex =
      typeof row.day_of_week === 'number' ? row.day_of_week : null
    const dayName =
      dayIndex != null && dayIndex >= 0 && dayIndex < 7
        ? DAY_NAMES[dayIndex]
        : `Day ${dayIndex ?? '?'}`
    const status = typeof row.status === 'string' ? row.status : 'unknown'
    const afterTime =
      typeof row.available_after_time === 'string'
        ? row.available_after_time
        : null
    if (status === 'available_after' && afterTime) {
      return `${dayName}: available after ${afterTime}`
    }
    return `${dayName}: ${status.replace(/_/g, ' ')}`
  })

  const upcomingBlackouts = (blackoutsResult.data ?? []).map((row) => {
    const start =
      typeof row.vacation_start === 'string' ? row.vacation_start : ''
    const end =
      typeof row.vacation_end === 'string' ? row.vacation_end : 'open-ended'
    return `${start} to ${end}`
  })

  const incompleteCourses = (incompleteCoursesResult.data ?? []).map((row) => {
    const templates = row.course_templates as
      | { course_name?: string }
      | { course_name?: string }[]
      | null
    const name = Array.isArray(templates)
      ? templates[0]?.course_name
      : templates?.course_name
    return name ?? 'Unnamed course'
  })

  const openActionItems = (actionItemsResult.data ?? []).map((row) => {
    const category =
      typeof row.category === 'string' ? row.category : 'general'
    const title = typeof row.title === 'string' ? row.title : ''
    const description =
      typeof row.description === 'string' ? row.description : ''
    const message = [title, description].filter(Boolean).join(' — ')
    return `${category}: ${message || 'No details'}`
  })

  const staffRow = staffResult.data

  return {
    staff: {
      legal_name: staffRow?.legal_name ?? null,
      display_name: staffRow?.display_name ?? null,
      basic_availability: staffRow?.basic_availability ?? null,
      coordinator_notes: staffRow?.coordinator_notes ?? null,
      average_rating: staffRow?.average_rating ?? null,
      rating_count: staffRow?.rating_count ?? null,
      experience_rating: staffRow?.experience_rating ?? null,
    },
    roles: (rolesResult.data ?? []).map((row) => ({
      role_name: row.role_name,
      is_primary: row.is_primary,
    })),
    event_counts: {
      confirmed_all_time: allTimeCountResult.count ?? 0,
      confirmed_ytd: ytdConfirmedCount,
    },
    future_assignments: futureAssignments,
    times_summary: timesSummaryText,
    captain_ratings_and_notes: captainNotes,
    certifications: certificationsResult.data ?? [],
    incomplete_courses: incompleteCourses,
    weekly_availability_summary: weeklyAvailability,
    upcoming_blackouts: upcomingBlackouts,
    availability_summary: {
      weekly: weeklyAvailability,
      blackouts: upcomingBlackouts,
      basic_availability: staffRow?.basic_availability ?? null,
    },
    open_action_items: openActionItems,
  }
}

function ThinkingDots() {
  return (
    <div className="flex items-center gap-1">
      <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:0ms]" />
      <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:150ms]" />
      <span className="inline-block size-1.5 animate-bounce rounded-full bg-gray-400 [animation-delay:300ms]" />
    </div>
  )
}

function IntroBox() {
  return (
    <div
      style={{
        backgroundColor: '#F9FAFB',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        padding: '12px 14px',
        fontSize: '13px',
        lineHeight: 1.6,
        color: '#4B5563',
      }}
    >
      {INTRO_TEXT}
    </div>
  )
}

export default function StaffProfileAISummaryTab({
  staffPhone,
  organizationId,
  staffName,
  staffFirstName,
}: StaffProfileAISummaryTabProps) {
  const { colors } = useProductConfig()
  const [loadingSaved, setLoadingSaved] = useState(true)
  const [savedSummary, setSavedSummary] = useState<SavedSummaryRow | null>(null)
  const [contextSnapshot, setContextSnapshot] = useState<Record<
    string,
    unknown
  > | null>(null)
  const [isGenerating, setIsGenerating] = useState(false)
  const [generateError, setGenerateError] = useState(false)
  const [fetchError, setFetchError] = useState(false)
  const [parseError, setParseError] = useState(false)
  const [followUpQuestion, setFollowUpQuestion] = useState('')
  const [followUpMessages, setFollowUpMessages] = useState<FollowUpMessage[]>(
    [],
  )
  const threadEndRef = useRef<HTMLDivElement>(null)

  const loadSavedSummary = useCallback(async () => {
    setLoadingSaved(true)
    const { data, error } = await supabase
      .from('staff_ai_summaries')
      .select('summary_json, generated_at, input_snapshot')
      .eq('staff_phone', staffPhone)
      .eq('organization_id', organizationId)
      .maybeSingle()

    if (error) {
      console.error('[StaffProfileAISummary] load saved summary failed', error)
      setSavedSummary(null)
      setLoadingSaved(false)
      return
    }

    if (
      data &&
      isSummaryJson(data.summary_json) &&
      typeof data.generated_at === 'string'
    ) {
      setSavedSummary({
        summary: data.summary_json,
        generatedAt: data.generated_at,
        inputSnapshot:
          data.input_snapshot && typeof data.input_snapshot === 'object'
            ? (data.input_snapshot as Record<string, unknown>)
            : {},
      })
      setContextSnapshot(
        data.input_snapshot && typeof data.input_snapshot === 'object'
          ? (data.input_snapshot as Record<string, unknown>)
          : null,
      )
    } else {
      setSavedSummary(null)
    }
    setLoadingSaved(false)
  }, [organizationId, staffPhone])

  useEffect(() => {
    void loadSavedSummary()
  }, [loadSavedSummary])

  useEffect(() => {
    threadEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [followUpMessages, isGenerating, savedSummary])

  const saveSummaryToDb = useCallback(
    async (
      summary: SummaryJson,
      inputSnapshot: Record<string, unknown>,
    ) => {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const metadataPhone = user?.user_metadata?.phone
      const generatedBy =
        typeof metadataPhone === 'string' && metadataPhone.trim()
          ? metadataPhone.trim()
          : typeof user?.phone === 'string'
            ? user.phone
            : typeof user?.email === 'string'
              ? user.email
              : null

      const { error } = await supabase.from('staff_ai_summaries').upsert(
        {
          staff_phone: staffPhone,
          organization_id: organizationId,
          generated_at: new Date().toISOString(),
          generated_by: generatedBy,
          model_used: ANTHROPIC_MODEL,
          summary_json: summary,
          input_snapshot: inputSnapshot,
        },
        { onConflict: 'staff_phone,organization_id' },
      )

      if (error) {
        console.error('[StaffProfileAISummary] save summary failed', error)
        throw error
      }
    },
    [organizationId, staffPhone],
  )

  const generateSummary = useCallback(async () => {
    setIsGenerating(true)
    setGenerateError(false)
    setParseError(false)
    setFetchError(false)

    try {
      const contextObject = await fetchStaffSummaryContext(
        staffPhone,
        organizationId,
      )
      setContextSnapshot(contextObject)

      const responseText = await callAnthropicApi(
        SUMMARY_SYSTEM_PROMPT,
        `Generate an operational summary for ${staffFirstName}. Here is their current data: ${JSON.stringify(contextObject)}`,
        1200,
      )

      const cleaned = stripMarkdownFences(responseText)
      let parsed: unknown
      try {
        parsed = JSON.parse(cleaned)
      } catch {
        setParseError(true)
        setIsGenerating(false)
        return
      }

      if (!isSummaryJson(parsed)) {
        setParseError(true)
        setIsGenerating(false)
        return
      }

      await saveSummaryToDb(parsed, contextObject)
      setSavedSummary({
        summary: parsed,
        generatedAt: new Date().toISOString(),
        inputSnapshot: contextObject,
      })
      setFollowUpMessages([])
    } catch (error) {
      console.error('[StaffProfileAISummary] generate failed', error)
      if (
        error instanceof Error &&
        error.message === 'Failed to load staff data'
      ) {
        setFetchError(true)
      } else {
        setGenerateError(true)
      }
    } finally {
      setIsGenerating(false)
    }
  }, [organizationId, saveSummaryToDb, staffFirstName, staffPhone])

  const handleFollowUpSubmit = useCallback(
    async (event?: FormEvent, questionOverride?: string) => {
      event?.preventDefault()
      const trimmed = (questionOverride ?? followUpQuestion).trim()
      if (!trimmed || !savedSummary) {
        return
      }

      const userMessageId = createMessageId()
      const assistantMessageId = createMessageId()
      const snapshot = contextSnapshot ?? savedSummary.inputSnapshot

      setFollowUpQuestion('')
      setFollowUpMessages((previous) => [
        ...previous,
        {
          id: userMessageId,
          role: 'user',
          text: trimmed,
          status: 'done',
        },
        {
          id: assistantMessageId,
          role: 'assistant',
          text: '',
          status: 'loading',
        },
      ])

      try {
        const priorThread = followUpMessages
          .filter((message) => message.status === 'done')
          .map((message) => ({
            role: message.role,
            content: message.text,
          }))

        const userContent = JSON.stringify({
          staff_name: staffName,
          staff_first_name: staffFirstName,
          original_summary: savedSummary.summary,
          staff_data_context: snapshot,
          prior_follow_ups: priorThread,
          question: trimmed,
        })

        const answer = await callAnthropicApi(
          FOLLOW_UP_SYSTEM_PROMPT,
          userContent,
          400,
        )

        setFollowUpMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: answer, status: 'done' as const }
              : message,
          ),
        )
      } catch (error) {
        console.error('[StaffProfileAISummary] follow-up failed', error)
        setFollowUpMessages((previous) =>
          previous.map((message) =>
            message.id === assistantMessageId
              ? { ...message, text: '', status: 'error' as const }
              : message,
          ),
        )
      }
    },
    [
      contextSnapshot,
      followUpMessages,
      followUpQuestion,
      savedSummary,
      staffFirstName,
      staffName,
    ],
  )

  const handleFollowUpKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault()
      void handleFollowUpSubmit()
    }
  }

  const renderError = (
    message: string,
    onRetry: () => void,
    retryLabel = 'Retry',
  ) => (
    <p style={{ fontSize: '13px', color: colors.brand_red, marginTop: '12px' }}>
      {message}{' '}
      <button
        type="button"
        onClick={onRetry}
        className="border-none bg-transparent p-0 underline"
        style={{
          color: colors.brand_navy,
          cursor: 'pointer',
          fontSize: 'inherit',
        }}
      >
        {retryLabel}
      </button>
    </p>
  )

  if (loadingSaved) {
    return (
      <div className="px-4 py-6">
        <IntroBox />
        <p style={{ fontSize: '13px', color: '#9CA3AF' }}>Loading…</p>
      </div>
    )
  }

  return (
    <div className="px-4 py-4">
      <style>{`
        @keyframes ai-summary-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.4; }
        }
      `}</style>

      <IntroBox />

      {isGenerating ? (
        <p
          style={{
            fontSize: '13px',
            color: '#6B7280',
            fontStyle: 'italic',
            animation: 'ai-summary-pulse 1.5s ease-in-out infinite',
          }}
        >
          Generating summary for {staffFirstName}…
        </p>
      ) : null}

      {fetchError
        ? renderError(
            'Failed to load staff data — please try again.',
            () => void generateSummary(),
          )
        : null}

      {generateError && !fetchError
        ? renderError(
            'Summary generation failed — please try again.',
            () => void generateSummary(),
          )
        : null}

      {parseError
        ? renderError(
            'Summary generation failed — please try again.',
            () => void generateSummary(),
          )
        : null}

      {!savedSummary && !isGenerating && !fetchError && !generateError ? (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <IconBrain size={48} color="#D1D5DB" stroke={1.5} />
          <p
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: colors.brand_navy,
              marginTop: '12px',
            }}
          >
            No summary generated yet
          </p>
          <p
            style={{
              fontSize: '13px',
              color: '#6B7280',
              marginTop: '8px',
              maxWidth: '320px',
            }}
          >
            Generate a summary to get an AI-powered operational snapshot of{' '}
            {staffFirstName} — including strengths, scheduling fit, compliance
            status, and development notes.
          </p>
          <button
            type="button"
            onClick={() => void generateSummary()}
            disabled={isGenerating}
            style={{
              marginTop: '16px',
              backgroundColor: colors.brand_navy,
              color: '#ffffff',
              borderRadius: '8px',
              padding: '10px 24px',
              fontSize: '14px',
              fontWeight: 500,
              border: 'none',
              cursor: isGenerating ? 'not-allowed' : 'pointer',
            }}
          >
            Generate Summary for {staffFirstName}
          </button>
        </div>
      ) : null}

      {savedSummary && !isGenerating ? (
        <>
          <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>
            Generated {formatGeneratedDate(savedSummary.generatedAt)} · Based on
            data available at time of generation{' '}
            <button
              type="button"
              onClick={() => void generateSummary()}
              disabled={isGenerating}
              className="border-none bg-transparent p-0 underline"
              style={{
                color: colors.brand_navy,
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                fontSize: 'inherit',
              }}
            >
              Regenerate
            </button>
          </p>

          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
              gap: '12px',
            }}
          >
            {SUMMARY_CARDS.map(({ key, label }) => (
              <div
                key={key}
                style={{
                  backgroundColor: '#ffffff',
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '14px 16px',
                }}
              >
                <div
                  className="flex items-center gap-1"
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    color: colors.brand_navy,
                    letterSpacing: '0.05em',
                    textTransform: 'uppercase',
                    marginBottom: '6px',
                  }}
                >
                  {label}
                  {key === 'watch_notes' &&
                  watchNotesIsClear(savedSummary.summary.watch_notes) ? (
                    <IconCheck size={14} color="#22C55E" stroke={2} />
                  ) : null}
                </div>
                <p
                  style={{
                    fontSize: '13px',
                    lineHeight: 1.6,
                    color: '#1F2937',
                    margin: 0,
                    whiteSpace: 'pre-wrap',
                  }}
                >
                  {savedSummary.summary[key]}
                </p>
              </div>
            ))}
          </div>

          <div
            style={{
              marginTop: '24px',
              paddingTop: '20px',
              borderTop: '1px solid #E5E7EB',
            }}
          >
            <p
              style={{
                fontSize: '13px',
                fontWeight: 600,
                color: colors.brand_navy,
                marginBottom: '10px',
              }}
            >
              Ask a follow-up about {staffFirstName}
            </p>

            {followUpMessages.length > 0 ? (
              <div className="mb-3 flex flex-col gap-3">
                {followUpMessages.map((message) => {
                  if (message.role === 'user') {
                    return (
                      <div
                        key={message.id}
                        className="flex justify-end"
                      >
                        <div
                          style={{
                            maxWidth: '85%',
                            backgroundColor: colors.brand_navy,
                            color: '#ffffff',
                            borderRadius: '12px 12px 2px 12px',
                            padding: '8px 12px',
                            fontSize: '13px',
                          }}
                        >
                          {message.text}
                        </div>
                      </div>
                    )
                  }

                  if (message.status === 'loading') {
                    return (
                      <div key={message.id} className="flex justify-start">
                        <div
                          style={{
                            backgroundColor: '#F3F4F6',
                            borderRadius: '12px 12px 12px 2px',
                            padding: '10px 14px',
                          }}
                        >
                          <ThinkingDots />
                        </div>
                      </div>
                    )
                  }

                  if (message.status === 'error') {
                    const messageIndex = followUpMessages.findIndex(
                      (entry) => entry.id === message.id,
                    )
                    const priorUser =
                      messageIndex > 0
                        ? [...followUpMessages]
                            .slice(0, messageIndex)
                            .reverse()
                            .find((entry) => entry.role === 'user')
                        : null

                    return (
                      <div key={message.id}>
                        {renderError(
                          'Something went wrong — please try again.',
                          () => {
                            if (priorUser?.text) {
                              setFollowUpMessages((previous) =>
                                previous.filter(
                                  (entry) =>
                                    entry.id !== message.id &&
                                    entry.id !== priorUser.id,
                                ),
                              )
                              void handleFollowUpSubmit(undefined, priorUser.text)
                            }
                          },
                        )}
                      </div>
                    )
                  }

                  return (
                    <div key={message.id} className="flex flex-col items-start">
                      <div
                        style={{
                          maxWidth: '90%',
                          backgroundColor: '#F3F4F6',
                          borderRadius: '12px 12px 12px 2px',
                          padding: '10px 14px',
                          fontSize: '13px',
                          color: '#1F2937',
                          lineHeight: 1.6,
                          whiteSpace: 'pre-wrap',
                        }}
                      >
                        {message.text}
                      </div>
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#9CA3AF',
                          marginTop: '4px',
                        }}
                      >
                        Powered by Claude
                      </span>
                    </div>
                  )
                })}
                <div ref={threadEndRef} />
              </div>
            ) : null}

            <form
              onSubmit={handleFollowUpSubmit}
              className="flex items-center gap-2"
            >
              <input
                type="text"
                value={followUpQuestion}
                onChange={(event) => setFollowUpQuestion(event.target.value)}
                onKeyDown={handleFollowUpKeyDown}
                placeholder="e.g. Is he a good fit for a 300-person gala? Is she ready to captain?"
                className="min-w-0 flex-1 outline-none"
                style={{
                  height: '34px',
                  fontSize: '13px',
                  padding: '0 12px',
                  border: '1px solid #E5E7EB',
                  borderRadius: '6px',
                  color: '#1F2937',
                }}
              />
              <button
                type="submit"
                style={{
                  height: '34px',
                  padding: '0 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  backgroundColor: colors.brand_navy,
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Ask
              </button>
            </form>
          </div>
        </>
      ) : null}
    </div>
  )
}
