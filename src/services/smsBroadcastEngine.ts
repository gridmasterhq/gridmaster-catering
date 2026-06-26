import { supabase } from '../lib/supabase'

export const OUTREACH_MESSAGE_TYPES = [
  'sos',
  'check_in',
  'check_out',
  'no_show_flag',
  'birthday',
  'recognition',
  'onboarding',
  'shift_reminder',
  'egift',
  'shift_offer',
  'broadcast',
  'urgent',
  'training_tip',
  'postponement',
  'health_check',
] as const

export type OutreachMessageType = (typeof OUTREACH_MESSAGE_TYPES)[number]

export type DeliveryStatus =
  | 'sent'
  | 'failed'
  | 'blocked_anti_fatigue'
  | 'escalation_ready'

export type AntiFatigueBlockReason =
  | 'quiet_hours'
  | 'weekly_max'
  | 'mute'
  | 'pause'
  | 'less'

export interface BroadcastRecipient {
  staff_phone: string
}

export interface SendBroadcastSMSParams {
  organization_id: string
  event_id: string | null
  recipients: BroadcastRecipient[]
  message_type: OutreachMessageType
  message_body: string
  bypass_anti_fatigue?: boolean
}

export interface SendBroadcastSMSResult {
  sent: string[]
  blocked: string[]
  failed: string[]
}

export interface AntiFatigueCheckResult {
  blocked: boolean
  reason?: AntiFatigueBlockReason
}

export interface ShiftOfferSMSParams {
  staffName: string
  companyName: string
  eventType: string
  dayOfWeek: string
  month: string
  date: string
  callTime: string
  city: string
  state: string
}

export interface EmergencyShiftSMSParams {
  companyName: string
  role: string
  date: string
  callTime: string
  city: string
}

const BYPASS_ANTI_FATIGUE_TYPES = new Set<OutreachMessageType>([
  'sos',
  'check_in',
  'check_out',
  'no_show_flag',
])

const QUIET_HOURS_WEEKLY_EXEMPT_TYPES = new Set<OutreachMessageType>([
  'sos',
  'check_in',
  'check_out',
  'no_show_flag',
  'shift_reminder',
  'egift',
])

const WEEKLY_COUNT_EXCLUDED_TYPES = new Set<OutreachMessageType>([
  'sos',
  'check_in',
  'check_out',
  'no_show_flag',
  'birthday',
  'recognition',
  'onboarding',
])

const CRITICAL_MESSAGE_TYPES = new Set<OutreachMessageType>([
  'sos',
  'no_show_flag',
  'urgent',
])

const PAUSE_ALLOWED_TYPES = new Set<OutreachMessageType>([
  'sos',
  'check_in',
  'check_out',
  'no_show_flag',
  'urgent',
  'shift_reminder',
  'egift',
])

type StaffSmsPreference = 'mute' | 'pause' | 'less' | 'normal'

interface OutreachMessageInsert {
  organization_id: string
  event_id: string | null
  staff_phone: string
  message_type: OutreachMessageType
  message_body: string
  sent_at: string
  delivery_status: DeliveryStatus
  twilio_sid: string | null
}

export function formatShiftOfferSMS(params: ShiftOfferSMSParams): string {
  return (
    `Hi ${params.staffName} — ${params.companyName} has a shift available: ` +
    `${params.eventType} — ${params.dayOfWeek}, ${params.month} ${params.date}. ` +
    `Call time: ${params.callTime} in ${params.city}, ${params.state}. ` +
    `Interested? Reply YES, NO, or MAYBE`
  )
}

export function formatEmergencyShiftSMS(params: EmergencyShiftSMSParams): string {
  return (
    `URGENT — ${params.companyName} needs a ${params.role} TODAY. ` +
    `${params.date} — Call time ${params.callTime} in ${params.city}. ` +
    `First to reply YES gets the shift. Reply YES or NO.`
  )
}

function shouldBypassAntiFatigue(
  messageType: OutreachMessageType,
  bypassFlag?: boolean,
): boolean {
  return bypassFlag === true && BYPASS_ANTI_FATIGUE_TYPES.has(messageType)
}

function isQuietHours(localHour: number): boolean {
  return localHour >= 22 || localHour < 7
}

function getLocalHour(now: Date, timezone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour: 'numeric',
    hour12: false,
  }).formatToParts(now)

  const hourPart = parts.find((part) => part.type === 'hour')
  return hourPart ? Number(hourPart.value) : now.getUTCHours()
}

function getWeekStartIso(now: Date, timezone: string): string {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  })
  const parts = formatter.formatToParts(now)
  const year = parts.find((p) => p.type === 'year')?.value ?? '1970'
  const month = parts.find((p) => p.type === 'month')?.value ?? '01'
  const day = parts.find((p) => p.type === 'day')?.value ?? '01'
  const weekday =
    parts.find((p) => p.type === 'weekday')?.value?.slice(0, 3) ?? 'Mon'

  const weekdayIndex: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  }

  const localDate = new Date(`${year}-${month}-${day}T12:00:00Z`)
  const dayOffset = weekdayIndex[weekday] ?? 1
  const daysFromMonday = (dayOffset + 6) % 7
  localDate.setUTCDate(localDate.getUTCDate() - daysFromMonday)
  localDate.setUTCHours(0, 0, 0, 0)
  return localDate.toISOString()
}

async function getOrganizationTimezone(organizationId: string): Promise<string> {
  const { data } = await supabase
    .from('organizations')
    .select('timezone')
    .eq('id', organizationId)
    .single()

  return typeof data?.timezone === 'string' && data.timezone.trim()
    ? data.timezone.trim()
    : 'America/New_York'
}

async function getStaffSmsPreference(
  organizationId: string,
  staffPhone: string,
): Promise<StaffSmsPreference> {
  const { data } = await supabase
    .from('staff')
    .select('sms_preference')
    .eq('organization_id', organizationId)
    .eq('phone', staffPhone)
    .maybeSingle()

  const preference = data?.sms_preference
  if (preference === 'mute' || preference === 'pause' || preference === 'less') {
    return preference
  }

  return 'normal'
}

async function countWeeklyNonUrgentMessages(
  organizationId: string,
  staffPhone: string,
  weekStartIso: string,
): Promise<number> {
  const { data, error } = await supabase
    .from('outreach_messages')
    .select('message_type')
    .eq('organization_id', organizationId)
    .eq('staff_phone', staffPhone)
    .gte('sent_at', weekStartIso)

  if (error || !data) {
    return 0
  }

  return data.filter(
    (row) =>
      !WEEKLY_COUNT_EXCLUDED_TYPES.has(
        row.message_type as OutreachMessageType,
      ),
  ).length
}

export async function checkAntiFatigue(
  organizationId: string,
  staffPhone: string,
  messageType: OutreachMessageType,
  bypassAntiFatigue?: boolean,
): Promise<AntiFatigueCheckResult> {
  if (shouldBypassAntiFatigue(messageType, bypassAntiFatigue)) {
    return { blocked: false }
  }

  const timezone = await getOrganizationTimezone(organizationId)
  const now = new Date()

  if (!QUIET_HOURS_WEEKLY_EXEMPT_TYPES.has(messageType)) {
    if (isQuietHours(getLocalHour(now, timezone))) {
      return { blocked: true, reason: 'quiet_hours' }
    }
  }

  if (!WEEKLY_COUNT_EXCLUDED_TYPES.has(messageType)) {
    const weekStartIso = getWeekStartIso(now, timezone)
    const weeklyCount = await countWeeklyNonUrgentMessages(
      organizationId,
      staffPhone,
      weekStartIso,
    )

    if (weeklyCount >= 3) {
      return { blocked: true, reason: 'weekly_max' }
    }
  }

  const preference = await getStaffSmsPreference(organizationId, staffPhone)

  if (preference === 'mute' && !QUIET_HOURS_WEEKLY_EXEMPT_TYPES.has(messageType)) {
    return { blocked: true, reason: 'mute' }
  }

  if (preference === 'pause' && !PAUSE_ALLOWED_TYPES.has(messageType)) {
    return { blocked: true, reason: 'pause' }
  }

  if (preference === 'less' && !CRITICAL_MESSAGE_TYPES.has(messageType)) {
    return { blocked: true, reason: 'less' }
  }

  return { blocked: false }
}

async function logOutreachMessage(record: OutreachMessageInsert): Promise<void> {
  const { error } = await supabase.from('outreach_messages').insert(record)

  if (error) {
    console.error('Failed to log outreach message', error.message)
  }
}

async function invokeSendSmsEdgeFunction(
  to: string,
  body: string,
  organizationId: string,
): Promise<{ sid: string | null; status: string | null }> {
  const { data, error } = await supabase.functions.invoke('send-sms', {
    body: {
      to,
      body,
      organization_id: organizationId,
    },
  })

  if (error) {
    return { sid: null, status: null }
  }

  const response = data as { sid?: string; status?: string } | null
  return {
    sid: response?.sid ?? null,
    status: response?.status ?? null,
  }
}

export async function sendBroadcastSMS(
  params: SendBroadcastSMSParams,
): Promise<SendBroadcastSMSResult> {
  const result: SendBroadcastSMSResult = {
    sent: [],
    blocked: [],
    failed: [],
  }

  const sentAt = new Date().toISOString()

  for (const recipient of params.recipients) {
    const staffPhone = recipient.staff_phone
    const fatigueCheck = await checkAntiFatigue(
      params.organization_id,
      staffPhone,
      params.message_type,
      params.bypass_anti_fatigue,
    )

    if (fatigueCheck.blocked) {
      await logOutreachMessage({
        organization_id: params.organization_id,
        event_id: params.event_id,
        staff_phone: staffPhone,
        message_type: params.message_type,
        message_body: params.message_body,
        sent_at: sentAt,
        delivery_status: 'blocked_anti_fatigue',
        twilio_sid: null,
      })
      result.blocked.push(staffPhone)
      continue
    }

    const twilioResponse = await invokeSendSmsEdgeFunction(
      staffPhone,
      params.message_body,
      params.organization_id,
    )

    if (!twilioResponse.sid) {
      await logOutreachMessage({
        organization_id: params.organization_id,
        event_id: params.event_id,
        staff_phone: staffPhone,
        message_type: params.message_type,
        message_body: params.message_body,
        sent_at: sentAt,
        delivery_status: 'failed',
        twilio_sid: null,
      })
      result.failed.push(staffPhone)
      continue
    }

    await logOutreachMessage({
      organization_id: params.organization_id,
      event_id: params.event_id,
      staff_phone: staffPhone,
      message_type: params.message_type,
      message_body: params.message_body,
      sent_at: sentAt,
      delivery_status: 'sent',
      twilio_sid: twilioResponse.sid,
    })
    result.sent.push(staffPhone)
  }

  return result
}
