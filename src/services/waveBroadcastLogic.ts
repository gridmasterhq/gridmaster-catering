import { supabase } from '../lib/supabase'
import {
  formatShiftOfferSMS,
  sendBroadcastSMS,
  type BroadcastRecipient,
  type OutreachMessageType,
} from './smsBroadcastEngine'

export type BroadcastMode = 'standard' | 'last_minute'

export interface RatingTierRecipients {
  min_rating: number
  recipients: BroadcastRecipient[]
}

export interface Wave1Result {
  wave1_sent_at: string
  wave2_scheduled_at: string
}

export interface Wave2Result {
  wave2_sent_at: string
  slots_filled_before: number
  slots_filled_after: number
}

interface EventBroadcastContext {
  id: string
  broadcast_mode: BroadcastMode | null
  event_name: string | null
  event_type: string | null
  event_date: string | null
  event_start_time: string | null
  city: string | null
  state: string | null
}

interface OrganizationBroadcastContext {
  name: string | null
  last_minute_wave2_hours: number | null
}

interface StaffNameRow {
  phone: string
  preferred_name: string | null
  first_name: string | null
}

const STANDARD_WAVE2_DELAY_MS = 48 * 60 * 60 * 1000
const DEFAULT_LAST_MINUTE_WAVE2_HOURS = 8

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * 60 * 60 * 1000)
}

function formatEventDateParts(eventDate: string | null): {
  dayOfWeek: string
  month: string
  date: string
  formattedDate: string
} {
  if (!eventDate) {
    return {
      dayOfWeek: 'TBD',
      month: 'TBD',
      date: 'TBD',
      formattedDate: 'TBD',
    }
  }

  const parsed = new Date(`${eventDate}T12:00:00`)
  return {
    dayOfWeek: parsed.toLocaleDateString('en-US', { weekday: 'long' }),
    month: parsed.toLocaleDateString('en-US', { month: 'long' }),
    date: String(parsed.getDate()),
    formattedDate: parsed.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    }),
  }
}

function resolveStaffName(staff: StaffNameRow | undefined): string {
  if (!staff) {
    return 'there'
  }

  if (staff.preferred_name?.trim()) {
    return staff.preferred_name.trim()
  }

  if (staff.first_name?.trim()) {
    return staff.first_name.trim()
  }

  return 'there'
}

async function loadEventContext(
  eventId: string,
  organizationId: string,
): Promise<EventBroadcastContext | null> {
  const { data, error } = await supabase
    .from('events')
    .select(
      'id, broadcast_mode, event_name, event_type, event_date, event_start_time, city, state',
    )
    .eq('id', eventId)
    .eq('organization_id', organizationId)
    .single()

  if (error || !data) {
    return null
  }

  return data as EventBroadcastContext
}

async function loadOrganizationContext(
  organizationId: string,
): Promise<OrganizationBroadcastContext> {
  const { data } = await supabase
    .from('organizations')
    .select('name, last_minute_wave2_hours')
    .eq('id', organizationId)
    .single()

  return {
    name: data?.name ?? null,
    last_minute_wave2_hours: data?.last_minute_wave2_hours ?? null,
  }
}

async function loadStaffNamesByPhone(
  organizationId: string,
  phones: string[],
): Promise<Map<string, StaffNameRow>> {
  if (phones.length === 0) {
    return new Map()
  }

  const { data } = await supabase
    .from('staff')
    .select('phone, preferred_name, first_name')
    .eq('organization_id', organizationId)
    .in('phone', phones)

  const map = new Map<string, StaffNameRow>()
  for (const row of (data ?? []) as StaffNameRow[]) {
    map.set(row.phone, row)
  }

  return map
}

function calculateWave2ScheduledAt(
  wave1SentAt: Date,
  broadcastMode: BroadcastMode | null,
  lastMinuteWave2Hours: number | null,
): string {
  if (broadcastMode === 'last_minute') {
    const hours = lastMinuteWave2Hours ?? DEFAULT_LAST_MINUTE_WAVE2_HOURS
    return addHours(wave1SentAt, hours).toISOString()
  }

  return new Date(wave1SentAt.getTime() + STANDARD_WAVE2_DELAY_MS).toISOString()
}

async function countFilledSlots(
  eventId: string,
  organizationId: string,
): Promise<{ filled: number; total: number }> {
  const [{ count: totalSlots }, { count: filledSlots }] = await Promise.all([
    supabase
      .from('event_grid_rows')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('event_id', eventId),
    supabase
      .from('event_staff_assignments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('event_id', eventId)
      .eq('status', 'confirmed'),
  ])

  return {
    filled: filledSlots ?? 0,
    total: totalSlots ?? 0,
  }
}

async function getConfirmedStaffPhones(
  eventId: string,
  organizationId: string,
): Promise<Set<string>> {
  const { data } = await supabase
    .from('event_staff_assignments')
    .select('staff_phone')
    .eq('organization_id', organizationId)
    .eq('event_id', eventId)
    .eq('status', 'confirmed')

  const phones = new Set<string>()
  for (const row of data ?? []) {
    if (typeof row.staff_phone === 'string' && row.staff_phone.trim()) {
      phones.add(row.staff_phone.trim())
    }
  }

  return phones
}

async function getWave2RecipientPhones(
  eventId: string,
  organizationId: string,
  confirmedPhones: Set<string>,
): Promise<BroadcastRecipient[]> {
  const { data } = await supabase
    .from('outreach_messages')
    .select('staff_phone, delivery_status')
    .eq('organization_id', organizationId)
    .eq('event_id', eventId)
    .in('message_type', ['shift_offer', 'broadcast'])
    .eq('delivery_status', 'sent')

  const candidates = new Set<string>()
  for (const row of data ?? []) {
    const phone =
      typeof row.staff_phone === 'string' ? row.staff_phone.trim() : ''
    if (phone && !confirmedPhones.has(phone)) {
      candidates.add(phone)
    }
  }

  return Array.from(candidates, (staff_phone) => ({ staff_phone }))
}

function buildShiftOfferBodies(
  recipients: BroadcastRecipient[],
  staffNames: Map<string, StaffNameRow>,
  event: EventBroadcastContext,
  companyName: string,
): Array<{ staff_phone: string; message_body: string }> {
  const dateParts = formatEventDateParts(event.event_date)

  return recipients.map((recipient) => ({
    staff_phone: recipient.staff_phone,
    message_body: formatShiftOfferSMS({
      staffName: resolveStaffName(staffNames.get(recipient.staff_phone)),
      companyName,
      eventType: event.event_type ?? event.event_name ?? 'Event',
      dayOfWeek: dateParts.dayOfWeek,
      month: dateParts.month,
      date: dateParts.date,
      callTime: event.event_start_time ?? 'TBD',
      city: event.city ?? 'TBD',
      state: event.state ?? '',
    }),
  }))
}

export async function fireWave1(
  event_id: string,
  organization_id: string,
  recipients: BroadcastRecipient[],
  rolesByRatingTier: RatingTierRecipients[],
): Promise<Wave1Result> {
  const event = await loadEventContext(event_id, organization_id)
  if (!event) {
    throw new Error(`Event ${event_id} not found for organization ${organization_id}`)
  }

  const organization = await loadOrganizationContext(organization_id)
  const companyName = organization.name?.trim() || 'Your catering team'

  const tierPhones = new Set(
    rolesByRatingTier.flatMap((tier) =>
      tier.recipients.map((recipient) => recipient.staff_phone),
    ),
  )

  const allPhones = Array.from(
    new Set([
      ...recipients.map((recipient) => recipient.staff_phone),
      ...tierPhones,
    ]),
  )

  const staffNames = await loadStaffNamesByPhone(organization_id, allPhones)
  const sortedTiers = [...rolesByRatingTier].sort(
    (a, b) => b.min_rating - a.min_rating,
  )

  for (const tier of sortedTiers) {
    if (tier.recipients.length === 0) {
      continue
    }

    const bodies = buildShiftOfferBodies(
      tier.recipients,
      staffNames,
      event,
      companyName,
    )

    for (const { staff_phone, message_body } of bodies) {
      await sendBroadcastSMS({
        organization_id,
        event_id,
        recipients: [{ staff_phone }],
        message_type: 'shift_offer',
        message_body,
      })
    }
  }

  const wave1SentAt = new Date()
  const wave2ScheduledAt = calculateWave2ScheduledAt(
    wave1SentAt,
    event.broadcast_mode,
    organization.last_minute_wave2_hours,
  )

  const { error } = await supabase
    .from('events')
    .update({
      wave1_sent_at: wave1SentAt.toISOString(),
      wave2_scheduled_at: wave2ScheduledAt,
    })
    .eq('id', event_id)
    .eq('organization_id', organization_id)

  if (error) {
    throw new Error(`Failed to update wave 1 timestamps: ${error.message}`)
  }

  return {
    wave1_sent_at: wave1SentAt.toISOString(),
    wave2_scheduled_at: wave2ScheduledAt,
  }
}

export async function fireWave2(
  event_id: string,
  organization_id: string,
): Promise<Wave2Result> {
  const event = await loadEventContext(event_id, organization_id)
  if (!event) {
    throw new Error(`Event ${event_id} not found for organization ${organization_id}`)
  }

  const organization = await loadOrganizationContext(organization_id)
  const companyName = organization.name?.trim() || 'Your catering team'

  const { filled: slotsFilledBefore } = await countFilledSlots(
    event_id,
    organization_id,
  )
  const confirmedPhones = await getConfirmedStaffPhones(event_id, organization_id)
  const wave2Recipients = await getWave2RecipientPhones(
    event_id,
    organization_id,
    confirmedPhones,
  )

  const staffNames = await loadStaffNamesByPhone(
    organization_id,
    wave2Recipients.map((recipient) => recipient.staff_phone),
  )

  const bodies = buildShiftOfferBodies(
    wave2Recipients,
    staffNames,
    event,
    companyName,
  )

  for (const { staff_phone, message_body } of bodies) {
    await sendBroadcastSMS({
      organization_id,
      event_id,
      recipients: [{ staff_phone }],
      message_type: 'shift_offer',
      message_body,
    })
  }

  const wave2SentAt = new Date()

  const { error } = await supabase
    .from('events')
    .update({
      wave2_sent_at: wave2SentAt.toISOString(),
    })
    .eq('id', event_id)
    .eq('organization_id', organization_id)

  if (error) {
    throw new Error(`Failed to update wave 2 timestamp: ${error.message}`)
  }

  const { filled: slotsFilledAfter } = await countFilledSlots(
    event_id,
    organization_id,
  )

  return {
    wave2_sent_at: wave2SentAt.toISOString(),
    slots_filled_before: slotsFilledBefore,
    slots_filled_after: slotsFilledAfter,
  }
}

export async function triggerWave2Early(
  event_id: string,
  organization_id: string,
  coordinator_phone: string,
): Promise<Wave2Result> {
  const { error: flagError } = await supabase
    .from('events')
    .update({ wave2_manually_triggered: true })
    .eq('id', event_id)
    .eq('organization_id', organization_id)

  if (flagError) {
    throw new Error(
      `Failed to set wave2_manually_triggered: ${flagError.message}`,
    )
  }

  await supabase.from('outreach_messages').insert({
    organization_id,
    event_id,
    staff_phone: coordinator_phone,
    message_type: 'broadcast',
    message_body: `Wave 2 manually triggered by coordinator ${coordinator_phone}`,
    sent_at: new Date().toISOString(),
    delivery_status: 'sent',
    twilio_sid: null,
  })

  return fireWave2(event_id, organization_id)
}

interface EscalationTier {
  hours: number
  fillBelow: number | null
  description: string
  messageType: OutreachMessageType
  emergency?: boolean
}

const ESCALATION_TIERS: EscalationTier[] = [
  {
    hours: 0,
    fillBelow: null,
    description: 'Escalation ready: 3+ star staff outreach',
    messageType: 'shift_offer',
  },
  {
    hours: 1,
    fillBelow: 80,
    description: 'Escalation ready: 2+ star staff outreach (fill below 80%)',
    messageType: 'shift_offer',
  },
  {
    hours: 2,
    fillBelow: 70,
    description:
      'Escalation ready: alumni pool — coordinator approval required (fill below 70%)',
    messageType: 'broadcast',
  },
  {
    hours: 3,
    fillBelow: 60,
    description: 'Escalation ready: adjacent market outreach (fill below 60%)',
    messageType: 'broadcast',
  },
  {
    hours: 4,
    fillBelow: 50,
    description:
      'Escalation ready: owner + coordinator + manager notification (fill below 50%)',
    messageType: 'broadcast',
  },
  {
    hours: 6,
    fillBelow: 100,
    description:
      'Emergency protocol ready: 6hr unfilled — $50 gift card attached to shift offer',
    messageType: 'shift_offer',
    emergency: true,
  },
]

export async function trackEscalationReadiness(
  event_id: string,
  organization_id: string,
  hours_since_wave1: number,
  fill_rate_percent: number,
): Promise<void> {
  const matchedTiers = ESCALATION_TIERS.filter((tier) => {
    if (hours_since_wave1 < tier.hours) {
      return false
    }

    if (tier.fillBelow == null) {
      return hours_since_wave1 === tier.hours
    }

    return fill_rate_percent < tier.fillBelow
  })

  if (matchedTiers.length === 0) {
    return
  }

  const sentAt = new Date().toISOString()

  for (const tier of matchedTiers) {
    const messageBody = tier.emergency
      ? `[EMERGENCY] ${tier.description}`
      : tier.description

    await supabase.from('outreach_messages').insert({
      organization_id,
      event_id,
      staff_phone: 'system',
      message_type: tier.messageType,
      message_body: messageBody,
      sent_at: sentAt,
      delivery_status: 'escalation_ready',
      twilio_sid: null,
    })
  }
}
