import { useEffect, useMemo, useRef, useState } from 'react'
import {
  IconAlertTriangle,
  IconCircleCheck,
  IconInfoCircle,
} from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { sendBroadcastSMS } from '../../services/smsBroadcastEngine'
import { supabase } from '../../lib/supabase'

type SOSState =
  | 'select_level'
  | 'confirm'
  | 'active'
  | 'resolution_form'
  | 'resolved'

type UrgencyLevel = 'urgent' | 'needs_attention' | 'fyi'

type TriggerRole =
  | 'captain'
  | 'cocaptain'
  | 'cit'
  | 'culinary_lead'
  | 'supervisor'
  | 'staff'

interface SOSCenterProps {
  event_id: string
  triggered_by: string
  trigger_role: TriggerRole
  organization_id: string
}

interface EscalationEntry {
  at: string
  message: string
}

interface ResolutionReport {
  what_happened: string
  how_resolved: string
  who_helped: string
  preventable: 'Yes' | 'No' | 'Unsure'
  follow_up_needed: 'Yes' | 'No'
}

const INCIDENT_TYPES = [
  'Medical emergency',
  'Security incident',
  'Staff altercation',
  'Equipment failure',
  'Weather',
  'Staffing crisis',
  'Client complaint',
  'Other',
] as const

function urgencyLabel(level: UrgencyLevel): string {
  if (level === 'urgent') {
    return 'SOS — URGENT'
  }
  if (level === 'needs_attention') {
    return 'Alert — Needs Attention'
  }
  return 'Update — FYI'
}

async function fetchManagementPhones(
  organizationId: string,
  roles: string[],
): Promise<string[]> {
  const { data } = await supabase
    .from('users')
    .select('phone')
    .eq('organization_id', organizationId)
    .in('role', roles)

  return (data ?? [])
    .map((row) => row.phone)
    .filter((phone): phone is string => typeof phone === 'string' && !!phone.trim())
}

async function appendEscalationLog(
  incidentId: string,
  organizationId: string,
  entry: EscalationEntry,
) {
  const { data } = await supabase
    .from('sos_incidents')
    .select('escalation_log')
    .eq('id', incidentId)
    .eq('organization_id', organizationId)
    .single()

  const currentLog = Array.isArray(data?.escalation_log)
    ? (data.escalation_log as EscalationEntry[])
    : []

  await supabase
    .from('sos_incidents')
    .update({ escalation_log: [...currentLog, entry] })
    .eq('id', incidentId)
    .eq('organization_id', organizationId)
}

function scheduleSosEscalation(
  incidentId: string,
  organizationId: string,
  urgency: UrgencyLevel,
  eventName: string,
  triggerRole: string,
) {
  const fireEscalation = async (
    roles: string[],
    message: string,
    delayMs: number,
  ) => {
    window.setTimeout(async () => {
      const { data: incident } = await supabase
        .from('sos_incidents')
        .select('resolved_at')
        .eq('id', incidentId)
        .eq('organization_id', organizationId)
        .single()

      if (incident?.resolved_at) {
        return
      }

      const phones = await fetchManagementPhones(organizationId, roles)
      if (phones.length > 0) {
        await sendBroadcastSMS({
          organization_id: organizationId,
          event_id: null,
          recipients: phones.map((staff_phone) => ({ staff_phone })),
          message_type: 'sos',
          message_body: message,
          bypass_anti_fatigue: true,
        })
      }

      await appendEscalationLog(incidentId, organizationId, {
        at: new Date().toISOString(),
        message,
      })
    }, delayMs)
  }

  if (urgency === 'urgent') {
    fireEscalation(
      ['coordinator', 'backup', 'owner', 'manager'],
      `SOS Escalation — No response in 5 minutes for ${eventName}. ${triggerRole} still needs help.`,
      5 * 60 * 1000,
    )
    fireEscalation(
      ['coordinator', 'backup', 'owner', 'manager', 'supervisor'],
      `SOS Escalation — No response in 10 minutes for ${eventName}. All account contacts notified.`,
      10 * 60 * 1000,
    )
  } else if (urgency === 'needs_attention') {
    fireEscalation(
      ['owner', 'manager'],
      `SOS Escalation — Needs Attention at ${eventName} has had no response in 15 minutes.`,
      15 * 60 * 1000,
    )
  }
}

export default function SOSCenter({
  event_id,
  triggered_by,
  trigger_role,
  organization_id,
}: SOSCenterProps) {
  const { brand_name } = useProductConfig()
  const [state, setState] = useState<SOSState>('select_level')
  const [selectedLevel, setSelectedLevel] = useState<UrgencyLevel | null>(null)
  const [initialMessage, setInitialMessage] = useState('')
  const [eventName, setEventName] = useState('Event')
  const [incidentId, setIncidentId] = useState<string | null>(null)
  const [triggeredAt, setTriggeredAt] = useState<string | null>(null)
  const [escalationLog, setEscalationLog] = useState<EscalationEntry[]>([])
  const [elapsedLabel, setElapsedLabel] = useState('0:00')
  const [resolution, setResolution] = useState<ResolutionReport>({
    what_happened: INCIDENT_TYPES[0],
    how_resolved: '',
    who_helped: '',
    preventable: 'Unsure',
    follow_up_needed: 'No',
  })

  const pollRef = useRef<number | null>(null)

  const hqIndex = brand_name.lastIndexOf(' ')
  const gridMasterWordmark =
    hqIndex === -1 ? brand_name : brand_name.slice(0, hqIndex)
  const hqWordmark = hqIndex === -1 ? '' : brand_name.slice(hqIndex + 1)

  useEffect(() => {
    async function loadEvent() {
      const { data } = await supabase
        .from('events')
        .select('event_name')
        .eq('id', event_id)
        .eq('organization_id', organization_id)
        .single()

      if (data?.event_name) {
        setEventName(data.event_name)
      }
    }

    loadEvent()
  }, [event_id, organization_id])

  useEffect(() => {
    if (state !== 'active' || !triggeredAt) {
      return
    }

    const updateElapsed = () => {
      const elapsedMs = Date.now() - new Date(triggeredAt).getTime()
      const totalSeconds = Math.floor(elapsedMs / 1000)
      const minutes = Math.floor(totalSeconds / 60)
      const seconds = totalSeconds % 60
      setElapsedLabel(`${minutes}:${String(seconds).padStart(2, '0')}`)
    }

    updateElapsed()
    const tickId = window.setInterval(updateElapsed, 1000)

    return () => {
      window.clearInterval(tickId)
    }
  }, [state, triggeredAt])

  useEffect(() => {
    if (state !== 'active' || !incidentId) {
      return
    }

    pollRef.current = window.setInterval(async () => {
      const { data } = await supabase
        .from('sos_incidents')
        .select('escalation_log, triggered_at, resolved_at')
        .eq('id', incidentId)
        .eq('organization_id', organization_id)
        .single()

      if (data?.resolved_at) {
        setState('resolved')
        return
      }

      if (Array.isArray(data?.escalation_log)) {
        setEscalationLog(data.escalation_log as EscalationEntry[])
      }
    }, 30000)

    return () => {
      if (pollRef.current) {
        window.clearInterval(pollRef.current)
      }
    }
  }, [incidentId, organization_id, state])

  const canResolve = useMemo(() => triggered_by.length > 0, [triggered_by])

  async function fireSosChain(level: UrgencyLevel, message: string) {
    let roles: string[] = ['coordinator']
    if (level === 'needs_attention') {
      roles = ['coordinator', 'backup']
    } else if (level === 'urgent') {
      roles = ['coordinator', 'backup', 'owner', 'manager']
    }

    const phones = await fetchManagementPhones(organization_id, roles)
    const urgencyText =
      level === 'urgent'
        ? 'urgent help'
        : level === 'needs_attention'
          ? 'attention'
          : 'an FYI update'

    const body =
      `SOS ${urgencyLabel(level)} — ${trigger_role} at ${eventName} needs ${urgencyText}. ` +
      `Reply ACTIVE or RESOLVED.${message ? ` ${message}` : ''}`

    if (phones.length > 0) {
      await sendBroadcastSMS({
        organization_id,
        event_id,
        recipients: phones.map((staff_phone) => ({ staff_phone })),
        message_type: 'sos',
        message_body: body,
        bypass_anti_fatigue: true,
      })
    }
  }

  async function handleSendSos() {
    if (!selectedLevel) {
      return
    }

    const now = new Date().toISOString()
    const { data, error } = await supabase
      .from('sos_incidents')
      .insert({
        organization_id,
        event_id,
        triggered_by,
        trigger_role,
        urgency_level: selectedLevel,
        triggered_at: now,
        initial_message: initialMessage.trim() || null,
        escalation_log: [],
      })
      .select('id')
      .single()

    if (error || !data?.id) {
      console.error('Failed to create SOS incident', error?.message)
      return
    }

    await fireSosChain(selectedLevel, initialMessage.trim())
    scheduleSosEscalation(
      data.id,
      organization_id,
      selectedLevel,
      eventName,
      trigger_role,
    )

    setIncidentId(data.id)
    setTriggeredAt(now)
    setState('active')
  }

  async function handleSubmitResolution() {
    if (!incidentId) {
      return
    }

    const resolvedAt = new Date().toISOString()
    await supabase
      .from('sos_incidents')
      .update({
        resolved_by: triggered_by,
        resolved_at: resolvedAt,
        resolution_report: resolution,
        followup_session_completed: false,
      })
      .eq('id', incidentId)
      .eq('organization_id', organization_id)

    const coordinatorPhones = await fetchManagementPhones(organization_id, [
      'coordinator',
    ])

    if (coordinatorPhones.length > 0) {
      await sendBroadcastSMS({
        organization_id,
        event_id,
        recipients: coordinatorPhones.map((staff_phone) => ({ staff_phone })),
        message_type: 'broadcast',
        message_body:
          `SOS Resolved — ${trigger_role} at ${eventName} marked incident closed. Report filed.`,
        bypass_anti_fatigue: true,
      })
    }

    setState('resolved')
  }

  if (state === 'resolved') {
    return (
      <div
        className="flex min-h-screen flex-col items-center justify-center px-6 text-center"
        style={{ backgroundColor: '#1B3A5C', color: '#ffffff' }}
      >
        <IconCircleCheck size={64} color="#ffffff" />
        <p style={{ fontSize: '22px', fontWeight: 600, marginTop: '16px' }}>
          Incident closed. Report saved.
        </p>
      </div>
    )
  }

  if (state === 'resolution_form') {
    return (
      <div className="min-h-screen bg-white px-4 py-6">
        <h1
          style={{
            fontSize: '20px',
            fontWeight: 600,
            color: '#1B3A5C',
            marginBottom: '20px',
          }}
        >
          Resolution Report
        </h1>

        <label className="mb-4 block text-sm font-medium text-text-body">
          What happened?
          <select
            value={resolution.what_happened}
            onChange={(event) =>
              setResolution((current) => ({
                ...current,
                what_happened: event.target.value,
              }))
            }
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          >
            {INCIDENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </label>

        <label className="mb-4 block text-sm font-medium text-text-body">
          How was it resolved?
          <textarea
            value={resolution.how_resolved}
            onChange={(event) =>
              setResolution((current) => ({
                ...current,
                how_resolved: event.target.value,
              }))
            }
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
            rows={3}
          />
        </label>

        <label className="mb-4 block text-sm font-medium text-text-body">
          Who helped?
          <input
            type="text"
            value={resolution.who_helped}
            onChange={(event) =>
              setResolution((current) => ({
                ...current,
                who_helped: event.target.value,
              }))
            }
            className="mt-1 w-full rounded border border-gray-300 px-3 py-2"
          />
        </label>

        <p className="mb-2 text-sm font-medium text-text-body">
          Could this have been prevented?
        </p>
        <div className="mb-4 flex gap-2">
          {(['Yes', 'No', 'Unsure'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() =>
                setResolution((current) => ({
                  ...current,
                  preventable: option,
                }))
              }
              style={{
                flex: 1,
                minHeight: '44px',
                borderRadius: '8px',
                border:
                  resolution.preventable === option
                    ? '2px solid #1B3A5C'
                    : '1px solid #d1d5db',
                backgroundColor:
                  resolution.preventable === option ? '#D5E8F0' : '#ffffff',
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <p className="mb-2 text-sm font-medium text-text-body">
          Follow-up needed?
        </p>
        <div className="mb-6 flex gap-2">
          {(['Yes', 'No'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() =>
                setResolution((current) => ({
                  ...current,
                  follow_up_needed: option,
                }))
              }
              style={{
                flex: 1,
                minHeight: '44px',
                borderRadius: '8px',
                border:
                  resolution.follow_up_needed === option
                    ? '2px solid #1B3A5C'
                    : '1px solid #d1d5db',
                backgroundColor:
                  resolution.follow_up_needed === option ? '#D5E8F0' : '#ffffff',
              }}
            >
              {option}
            </button>
          ))}
        </div>

        <button
          type="button"
          disabled={
            !resolution.how_resolved.trim() || !resolution.who_helped.trim()
          }
          onClick={handleSubmitResolution}
          style={{
            width: '100%',
            minHeight: '56px',
            borderRadius: '10px',
            backgroundColor: '#1B3A5C',
            color: '#ffffff',
            fontSize: '17px',
            fontWeight: 600,
            border: 'none',
          }}
        >
          Submit Report
        </button>
      </div>
    )
  }

  if (state === 'active') {
    return (
      <div
        className="min-h-screen px-4 py-6"
        style={{ backgroundColor: '#1B3A5C', color: '#ffffff' }}
      >
        <div className="text-center">
          <p style={{ fontSize: '14px', opacity: 0.9 }}>
            {gridMasterWordmark}
            {hqWordmark ? (
              <span style={{ color: '#E74C3C' }}>{hqWordmark}</span>
            ) : null}
          </p>
          <h1 style={{ fontSize: '24px', fontWeight: 700, marginTop: '24px' }}>
            SOS Active — Help is on the way
          </h1>
          <p style={{ marginTop: '8px', fontSize: '16px' }}>
            {selectedLevel ? urgencyLabel(selectedLevel) : 'SOS'}
          </p>
          <p style={{ marginTop: '16px', fontSize: '28px', fontWeight: 600 }}>
            {elapsedLabel}
          </p>
        </div>

        {escalationLog.length > 0 ? (
          <div className="mt-8 rounded-lg bg-white/10 p-4">
            <p style={{ fontWeight: 600, marginBottom: '8px' }}>Escalation log</p>
            {escalationLog.map((entry) => (
              <p key={entry.at} style={{ fontSize: '13px', marginBottom: '6px' }}>
                {entry.message}
              </p>
            ))}
          </div>
        ) : null}

        {canResolve ? (
          <button
            type="button"
            onClick={() => setState('resolution_form')}
            style={{
              width: '100%',
              minHeight: '56px',
              borderRadius: '10px',
              backgroundColor: '#ffffff',
              color: '#1B3A5C',
              fontSize: '17px',
              fontWeight: 600,
              border: 'none',
              marginTop: '32px',
            }}
          >
            Mark Resolved
          </button>
        ) : null}

        {triggeredAt ? (
          <p className="mt-4 text-center text-xs opacity-70">
            Triggered at {new Date(triggeredAt).toLocaleTimeString()}
          </p>
        ) : null}
      </div>
    )
  }

  if (state === 'confirm' && selectedLevel) {
    const buttonColor =
      selectedLevel === 'urgent'
        ? '#DC2626'
        : selectedLevel === 'needs_attention'
          ? '#D97706'
          : '#1B3A5C'

    return (
      <div
        className="min-h-screen px-4 py-6"
        style={{ backgroundColor: '#1B3A5C', color: '#ffffff' }}
      >
        <div className="text-center">
          <p style={{ fontSize: '14px' }}>
            {gridMasterWordmark}
            {hqWordmark ? (
              <span style={{ color: '#E74C3C' }}>{hqWordmark}</span>
            ) : null}
          </p>
          <h1 style={{ fontSize: '22px', fontWeight: 700, marginTop: '20px' }}>
            {urgencyLabel(selectedLevel)}
          </h1>
        </div>

        <textarea
          value={initialMessage}
          onChange={(event) => setInitialMessage(event.target.value)}
          placeholder="Briefly describe the situation (optional)"
          className="mt-6 w-full rounded-lg border border-white/20 bg-white/10 px-3 py-3 text-white placeholder:text-white/60"
          rows={4}
        />

        <button
          type="button"
          onClick={handleSendSos}
          style={{
            width: '100%',
            minHeight: '56px',
            borderRadius: '10px',
            backgroundColor: buttonColor,
            color: '#ffffff',
            fontSize: '18px',
            fontWeight: 700,
            border: 'none',
            marginTop: '20px',
          }}
        >
          SEND SOS
        </button>

        <button
          type="button"
          onClick={() => setState('select_level')}
          style={{
            width: '100%',
            marginTop: '16px',
            background: 'none',
            border: 'none',
            color: '#ffffff',
            textDecoration: 'underline',
            cursor: 'pointer',
          }}
        >
          Cancel
        </button>
      </div>
    )
  }

  return (
    <div
      className="min-h-screen px-4 py-6"
      style={{ backgroundColor: '#1B3A5C', color: '#ffffff' }}
    >
      <div className="text-center">
        <p style={{ fontSize: '14px' }}>
          {gridMasterWordmark}
          {hqWordmark ? (
            <span style={{ color: '#E74C3C' }}>{hqWordmark}</span>
          ) : null}
        </p>
        <h1 style={{ fontSize: '22px', fontWeight: 700, marginTop: '20px' }}>
          SOS Center
        </h1>
        <p style={{ marginTop: '6px', opacity: 0.85 }}>{eventName}</p>
      </div>

      <div className="mt-8 flex flex-col gap-4">
        <button
          type="button"
          onClick={() => {
            setSelectedLevel('urgent')
            setState('confirm')
          }}
          style={{
            width: '100%',
            minHeight: '88px',
            borderRadius: '12px',
            backgroundColor: '#DC2626',
            color: '#ffffff',
            border: 'none',
            textAlign: 'left',
            padding: '16px',
          }}
        >
          <div className="flex items-center gap-3">
            <IconAlertTriangle size={28} />
            <div>
              <p style={{ fontWeight: 700, fontSize: '17px' }}>SOS — URGENT</p>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>
                Immediate safety concern. All management notified now.
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedLevel('needs_attention')
            setState('confirm')
          }}
          style={{
            width: '100%',
            minHeight: '88px',
            borderRadius: '12px',
            backgroundColor: '#D97706',
            color: '#ffffff',
            border: 'none',
            textAlign: 'left',
            padding: '16px',
          }}
        >
          <div className="flex items-center gap-3">
            <IconAlertTriangle size={28} />
            <div>
              <p style={{ fontWeight: 700, fontSize: '17px' }}>
                Alert — Needs Attention
              </p>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>
                Issue needs coordinator response.
              </p>
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => {
            setSelectedLevel('fyi')
            setState('confirm')
          }}
          style={{
            width: '100%',
            minHeight: '88px',
            borderRadius: '12px',
            backgroundColor: '#1B3A5C',
            color: '#ffffff',
            border: '2px solid #ffffff',
            textAlign: 'left',
            padding: '16px',
          }}
        >
          <div className="flex items-center gap-3">
            <IconInfoCircle size={28} />
            <div>
              <p style={{ fontWeight: 700, fontSize: '17px' }}>Update — FYI</p>
              <p style={{ fontSize: '13px', marginTop: '4px' }}>
                Keeping the team informed.
              </p>
            </div>
          </div>
        </button>
      </div>
    </div>
  )
}
