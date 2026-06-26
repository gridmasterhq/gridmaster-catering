import { useEffect, useMemo, useState } from 'react'
import {
  IconArrowLeftRight,
  IconArrowsLeftRight,
  IconBolt,
  IconChevronRight,
  IconClockExclamation,
  IconLayoutGrid,
  IconPhone,
  IconUserCheck,
  IconUserX,
  IconX,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import {
  formatEmergencyShiftSMS,
  formatShiftOfferSMS,
  sendBroadcastSMS,
} from '../../services/smsBroadcastEngine'
import { supabase } from '../../lib/supabase'

type OverlayId =
  | 'status'
  | 'backfill'
  | 'transfer'
  | 'emergency_fill'
  | 'temp_approval'
  | 'swap_approval'
  | 'late_arrival'
  | 'quick_contact'
  | null

type EventDotStatus = 'green' | 'amber' | 'red'

interface MobileCommandCenterProps {
  event_id: string
  organization_id: string
  coordinator_phone: string
}

interface TodayEvent {
  id: string
  event_name: string
  status: EventDotStatus
}

interface AssignmentOption {
  staff_phone: string
  staff_name: string
  role: string
}

interface StaffOption {
  phone: string
  name: string
  role: string
  average_rating: number | null
}

const ACTIONS: Array<{
  id: OverlayId
  label: string
  description: string
  icon: Icon
}> = [
  {
    id: 'status',
    label: 'All-Events Status',
    description: "Today's events at a glance",
    icon: IconLayoutGrid,
  },
  {
    id: 'backfill',
    label: 'Call-Out → Backfill',
    description: 'Staff called out — find a replacement now',
    icon: IconUserX,
  },
  {
    id: 'transfer',
    label: 'Staff Transfer',
    description: 'Move staff between events',
    icon: IconArrowsLeftRight,
  },
  {
    id: 'emergency_fill',
    label: 'Emergency Fill',
    description: 'Open slot — send offer fast',
    icon: IconBolt,
  },
  {
    id: 'temp_approval',
    label: 'Unexpected Temp Approval',
    description: 'Extra staff arrived — approve or flag',
    icon: IconUserCheck,
  },
  {
    id: 'swap_approval',
    label: 'Shift Swap Approval',
    description: 'Staff swap request pending',
    icon: IconArrowLeftRight,
  },
  {
    id: 'late_arrival',
    label: 'Late Arrival Logging',
    description: 'Staff running late — log and notify',
    icon: IconClockExclamation,
  },
  {
    id: 'quick_contact',
    label: 'Quick Staff Contact',
    description: 'Call or text any staff member',
    icon: IconPhone,
  },
]

function staffDisplayName(staff: {
  preferred_name?: string | null
  display_name?: string | null
  first_name?: string | null
  phone: string
}): string {
  return (
    staff.preferred_name?.trim() ||
    staff.display_name?.trim() ||
    staff.first_name?.trim() ||
    staff.phone
  )
}

function dotColor(status: EventDotStatus): string {
  if (status === 'green') {
    return '#22C55E'
  }
  if (status === 'amber') {
    return '#F59E0B'
  }
  return '#EF4444'
}

export default function MobileCommandCenter({
  event_id,
  organization_id,
  coordinator_phone: _coordinatorPhone,
}: MobileCommandCenterProps) {
  const { brand_name, labels } = useProductConfig()
  const [todayEvents, setTodayEvents] = useState<TodayEvent[]>([])
  const [activeOverlay, setActiveOverlay] = useState<OverlayId>(null)
  const [organizationName, setOrganizationName] = useState('Your team')
  const [currentEventName, setCurrentEventName] = useState('Event')

  const [assignments, setAssignments] = useState<AssignmentOption[]>([])
  const [staffPool, setStaffPool] = useState<StaffOption[]>([])

  const [calledOutPhone, setCalledOutPhone] = useState('')
  const [replacementPhone, setReplacementPhone] = useState('')
  const [transferFromEventId, setTransferFromEventId] = useState(event_id)
  const [transferToEventId, setTransferToEventId] = useState('')
  const [transferStaffQuery, setTransferStaffQuery] = useState('')
  const [transferStaffPhone, setTransferStaffPhone] = useState('')
  const [emergencyRole, setEmergencyRole] = useState('server')
  const [ratingFloor, setRatingFloor] = useState(3)
  const [tempStaffName, setTempStaffName] = useState('')
  const [swapStaffA, setSwapStaffA] = useState('')
  const [swapStaffB, setSwapStaffB] = useState('')
  const [lateStaffPhone, setLateStaffPhone] = useState('')
  const [lateArrivalTime, setLateArrivalTime] = useState('')
  const [contactQuery, setContactQuery] = useState('')
  const [contactMessage, setContactMessage] = useState('')
  const [selectedContact, setSelectedContact] = useState<StaffOption | null>(
    null,
  )
  const [overlayBusy, setOverlayBusy] = useState(false)

  const hqIndex = brand_name.lastIndexOf(' ')
  const gridMasterWordmark =
    hqIndex === -1 ? brand_name : brand_name.slice(0, hqIndex)
  const hqWordmark = hqIndex === -1 ? '' : brand_name.slice(hqIndex + 1)

  const todayIso = useMemo(() => new Date().toISOString().split('T')[0], [])

  useEffect(() => {
    async function loadData() {
      const { data: org } = await supabase
        .from('organizations')
        .select('name')
        .eq('id', organization_id)
        .single()

      if (org?.name) {
        setOrganizationName(org.name)
      }

      const { data: events } = await supabase
        .from('events')
        .select('id, event_name')
        .eq('organization_id', organization_id)
        .eq('event_date', todayIso)
        .eq('is_cancelled', false)

      const eventRows: TodayEvent[] = []
      for (const event of events ?? []) {
        const [{ count: required }, { count: confirmed }] = await Promise.all([
          supabase
            .from('event_grid_rows')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organization_id)
            .eq('event_id', event.id),
          supabase
            .from('event_staff_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('organization_id', organization_id)
            .eq('event_id', event.id)
            .eq('status', 'confirmed'),
        ])

        let status: EventDotStatus = 'green'
        const requiredCount = required ?? 0
        const confirmedCount = confirmed ?? 0
        if (requiredCount > 0 && confirmedCount < requiredCount) {
          status =
            confirmedCount / requiredCount < 0.7 ? 'red' : 'amber'
        }

        eventRows.push({
          id: event.id,
          event_name: event.event_name ?? 'Event',
          status,
        })
      }

      setTodayEvents(eventRows)
      const current = eventRows.find((row) => row.id === event_id)
      if (current) {
        setCurrentEventName(current.event_name)
      }

      const { data: eventAssignments } = await supabase
        .from('event_staff_assignments')
        .select('staff_phone, role')
        .eq('organization_id', organization_id)
        .eq('event_id', event_id)

      const { data: staffRows } = await supabase
        .from('staff')
        .select(
          'phone, preferred_name, display_name, first_name, average_rating',
        )
        .eq('organization_id', organization_id)

      const staffByPhone = new Map((staffRows ?? []).map((s) => [s.phone, s]))

      setAssignments(
        (eventAssignments ?? []).map((assignment) => {
          const staff = staffByPhone.get(assignment.staff_phone)
          return {
            staff_phone: assignment.staff_phone,
            staff_name: staff
              ? staffDisplayName({ ...staff, phone: assignment.staff_phone })
              : assignment.staff_phone,
            role: assignment.role ?? 'Staff',
          }
        }),
      )

      setStaffPool(
        (staffRows ?? [])
          .map((staff) => ({
            phone: staff.phone,
            name: staffDisplayName(staff),
            role: 'Staff',
            average_rating:
              typeof staff.average_rating === 'number'
                ? staff.average_rating
                : null,
          }))
          .sort(
            (a, b) => (b.average_rating ?? 0) - (a.average_rating ?? 0),
          ),
      )
    }

    loadData()
  }, [event_id, organization_id, todayIso])

  const replacementCandidates = useMemo(
    () =>
      staffPool
        .filter((staff) => staff.average_rating == null || staff.average_rating >= 3)
        .concat(
          staffPool.filter(
            (staff) =>
              staff.average_rating != null && staff.average_rating < 3,
          ),
        ),
    [staffPool],
  )

  const filteredContacts = useMemo(() => {
    const query = contactQuery.trim().toLowerCase()
    if (!query) {
      return staffPool.slice(0, 12)
    }
    return staffPool.filter(
      (staff) =>
        staff.name.toLowerCase().includes(query) ||
        staff.phone.includes(query),
    )
  }, [contactQuery, staffPool])

  async function getCaptainPhone(targetEventId: string): Promise<string | null> {
    const { data } = await supabase
      .from('event_staff_assignments')
      .select('staff_phone')
      .eq('organization_id', organization_id)
      .eq('event_id', targetEventId)
      .eq('role', 'captain')
      .eq('status', 'confirmed')
      .limit(1)
      .maybeSingle()

    return data?.staff_phone ?? null
  }

  async function confirmBackfill() {
    if (!calledOutPhone || !replacementPhone) {
      return
    }
    setOverlayBusy(true)

    const replacement = staffPool.find((s) => s.phone === replacementPhone)
    const { data: event } = await supabase
      .from('events')
      .select('event_name, event_type, event_date, event_start_time, city, state')
      .eq('id', event_id)
      .single()

    const eventDate = event?.event_date
      ? new Date(`${event.event_date}T12:00:00`)
      : new Date()

    const body = formatShiftOfferSMS({
      staffName: replacement?.name ?? 'there',
      companyName: organizationName,
      eventType: event?.event_type ?? event?.event_name ?? 'Shift',
      dayOfWeek: eventDate.toLocaleDateString('en-US', { weekday: 'long' }),
      month: eventDate.toLocaleDateString('en-US', { month: 'long' }),
      date: String(eventDate.getDate()),
      callTime: event?.event_start_time ?? 'TBD',
      city: event?.city ?? 'TBD',
      state: event?.state ?? '',
    })

    await sendBroadcastSMS({
      organization_id,
      event_id,
      recipients: [{ staff_phone: replacementPhone }],
      message_type: 'shift_offer',
      message_body: body,
    })

    setOverlayBusy(false)
    setActiveOverlay(null)
  }

  async function confirmTransfer() {
    if (!transferStaffPhone || !transferToEventId) {
      return
    }
    setOverlayBusy(true)

    const staff = staffPool.find((s) => s.phone === transferStaffPhone)
    const staffName = staff?.name ?? transferStaffPhone
    const outgoingCaptain = await getCaptainPhone(transferFromEventId)
    const receivingCaptain = await getCaptainPhone(transferToEventId)

    await sendBroadcastSMS({
      organization_id,
      event_id: transferToEventId,
      recipients: [{ staff_phone: transferStaffPhone }],
      message_type: 'broadcast',
      message_body: `${organizationName}: You have been transferred to a new event assignment today.`,
    })

    if (outgoingCaptain) {
      await sendBroadcastSMS({
        organization_id,
        event_id: transferFromEventId,
        recipients: [{ staff_phone: outgoingCaptain }],
        message_type: 'broadcast',
        message_body: `${staffName} is leaving your event for another assignment.`,
      })
    }

    if (receivingCaptain) {
      await sendBroadcastSMS({
        organization_id,
        event_id: transferToEventId,
        recipients: [{ staff_phone: receivingCaptain }],
        message_type: 'broadcast',
        message_body: `${staffName} is arriving on your event from another assignment.`,
      })
    }

    setOverlayBusy(false)
    setActiveOverlay(null)
  }

  async function confirmEmergencyFill() {
    setOverlayBusy(true)
    const targets = staffPool.filter(
      (staff) =>
        staff.average_rating == null || staff.average_rating >= ratingFloor,
    )

    const { data: event } = await supabase
      .from('events')
      .select('event_date, event_start_time, city')
      .eq('id', event_id)
      .single()

    const body = formatEmergencyShiftSMS({
      companyName: organizationName,
      role: emergencyRole,
      date: event?.event_date ?? 'today',
      callTime: event?.event_start_time ?? 'TBD',
      city: event?.city ?? 'venue',
    })

    await sendBroadcastSMS({
      organization_id,
      event_id,
      recipients: targets.slice(0, 20).map((staff) => ({
        staff_phone: staff.phone,
      })),
      message_type: 'shift_offer',
      message_body: body,
    })

    setOverlayBusy(false)
    setActiveOverlay(null)
  }

  async function confirmTempApproval(approved: boolean) {
    setOverlayBusy(true)
    const captainPhone = await getCaptainPhone(event_id)
    if (captainPhone) {
      await sendBroadcastSMS({
        organization_id,
        event_id,
        recipients: [{ staff_phone: captainPhone }],
        message_type: 'broadcast',
        message_body: approved
          ? `Temp staff ${tempStaffName || 'arrival'} approved for ${currentEventName}.`
          : `Temp staff ${tempStaffName || 'arrival'} flagged for review at ${currentEventName}.`,
      })
    }
    setOverlayBusy(false)
    setActiveOverlay(null)
  }

  async function confirmSwapApproval() {
    setOverlayBusy(true)
    const body = `Shift swap approved for ${swapStaffA} and ${swapStaffB} at ${currentEventName}.`
    const phones = staffPool
      .filter((staff) =>
        [swapStaffA, swapStaffB].some((name) =>
          staff.name.toLowerCase().includes(name.toLowerCase()),
        ),
      )
      .map((staff) => staff.phone)

    if (phones.length > 0) {
      await sendBroadcastSMS({
        organization_id,
        event_id,
        recipients: phones.map((staff_phone) => ({ staff_phone })),
        message_type: 'broadcast',
        message_body: body,
      })
    }

    setOverlayBusy(false)
    setActiveOverlay(null)
  }

  async function confirmLateArrival() {
    if (!lateStaffPhone || !lateArrivalTime) {
      return
    }
    setOverlayBusy(true)

    await supabase
      .from('event_staff_assignments')
      .update({ late_arrival_expected_at: lateArrivalTime })
      .eq('organization_id', organization_id)
      .eq('event_id', event_id)
      .eq('staff_phone', lateStaffPhone)

    const captainPhone = await getCaptainPhone(event_id)
    const staff = assignments.find((row) => row.staff_phone === lateStaffPhone)

    if (captainPhone && staff) {
      await sendBroadcastSMS({
        organization_id,
        event_id,
        recipients: [{ staff_phone: captainPhone }],
        message_type: 'broadcast',
        message_body: `${staff.staff_name} is running late. Expected arrival: ${lateArrivalTime}.`,
      })
    }

    setOverlayBusy(false)
    setActiveOverlay(null)
  }

  async function sendQuickContactSms() {
    if (!selectedContact || !contactMessage.trim()) {
      return
    }
    setOverlayBusy(true)
    await sendBroadcastSMS({
      organization_id,
      event_id,
      recipients: [{ staff_phone: selectedContact.phone }],
      message_type: 'broadcast',
      message_body: contactMessage.trim(),
    })
    setOverlayBusy(false)
    setActiveOverlay(null)
  }

  function renderOverlayBody() {
    if (!activeOverlay) {
      return null
    }

    if (activeOverlay === 'status') {
      return (
        <div className="flex flex-col gap-3">
          {todayEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              onClick={() => {
                document
                  .getElementById(`event-section-${event.id}`)
                  ?.scrollIntoView({ behavior: 'smooth' })
                setActiveOverlay(null)
              }}
              className="flex items-center justify-between rounded-lg border border-gray-200 px-4 py-3 text-left"
            >
              <span>{event.event_name}</span>
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: dotColor(event.status) }}
              />
            </button>
          ))}
        </div>
      )
    }

    if (activeOverlay === 'backfill') {
      return (
        <div className="flex flex-col gap-3">
          <select
            value={calledOutPhone}
            onChange={(event) => setCalledOutPhone(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Called-out staff member</option>
            {assignments.map((row) => (
              <option key={row.staff_phone} value={row.staff_phone}>
                {row.staff_name} — {row.role}
              </option>
            ))}
          </select>
          <select
            value={replacementPhone}
            onChange={(event) => setReplacementPhone(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Replacement staff (rating sorted)</option>
            {replacementCandidates.map((staff) => (
              <option key={staff.phone} value={staff.phone}>
                {staff.name}
                {staff.average_rating != null
                  ? ` — ${staff.average_rating}★`
                  : ''}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={overlayBusy}
            onClick={confirmBackfill}
            className="min-h-14 rounded-lg bg-brand-navy text-white"
          >
            Send Shift Offer
          </button>
        </div>
      )
    }

    if (activeOverlay === 'transfer') {
      return (
        <div className="flex flex-col gap-3">
          <select
            value={transferFromEventId}
            onChange={(event) => setTransferFromEventId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            {todayEvents.map((event) => (
              <option key={event.id} value={event.id}>
                From: {event.event_name}
              </option>
            ))}
          </select>
          <input
            type="text"
            value={transferStaffQuery}
            onChange={(event) => setTransferStaffQuery(event.target.value)}
            placeholder="Staff name search"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <select
            value={transferStaffPhone}
            onChange={(event) => setTransferStaffPhone(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Select staff</option>
            {staffPool
              .filter((staff) =>
                transferStaffQuery
                  ? staff.name
                      .toLowerCase()
                      .includes(transferStaffQuery.toLowerCase())
                  : true,
              )
              .map((staff) => (
                <option key={staff.phone} value={staff.phone}>
                  {staff.name}
                </option>
              ))}
          </select>
          <select
            value={transferToEventId}
            onChange={(event) => setTransferToEventId(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">To event</option>
            {todayEvents.map((event) => (
              <option key={event.id} value={event.id}>
                {event.event_name}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={overlayBusy}
            onClick={confirmTransfer}
            className="min-h-14 rounded-lg bg-brand-navy text-white"
          >
            Confirm Transfer
          </button>
        </div>
      )
    }

    if (activeOverlay === 'emergency_fill') {
      return (
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={emergencyRole}
            onChange={(event) => setEmergencyRole(event.target.value)}
            placeholder="Role needed"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <input
            type="number"
            min={1}
            max={4}
            value={ratingFloor}
            onChange={(event) => setRatingFloor(Number(event.target.value))}
            placeholder="Rating floor"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <button
            type="button"
            disabled={overlayBusy}
            onClick={confirmEmergencyFill}
            className="min-h-14 rounded-lg bg-brand-navy text-white"
          >
            Send Emergency Offer
          </button>
        </div>
      )
    }

    if (activeOverlay === 'temp_approval') {
      return (
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={tempStaffName}
            onChange={(event) => setTempStaffName(event.target.value)}
            placeholder="Temp staff name"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <button
            type="button"
            disabled={overlayBusy}
            onClick={() => confirmTempApproval(true)}
            className="min-h-14 rounded-lg bg-brand-navy text-white"
          >
            Approve
          </button>
          <button
            type="button"
            disabled={overlayBusy}
            onClick={() => confirmTempApproval(false)}
            className="min-h-14 rounded-lg border border-brand-navy text-brand-navy"
          >
            Flag for Review
          </button>
        </div>
      )
    }

    if (activeOverlay === 'swap_approval') {
      return (
        <div className="flex flex-col gap-3">
          <input
            type="text"
            value={swapStaffA}
            onChange={(event) => setSwapStaffA(event.target.value)}
            placeholder="Staff member A"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <input
            type="text"
            value={swapStaffB}
            onChange={(event) => setSwapStaffB(event.target.value)}
            placeholder="Staff member B"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <button
            type="button"
            disabled={overlayBusy}
            onClick={confirmSwapApproval}
            className="min-h-14 rounded-lg bg-brand-navy text-white"
          >
            Approve Swap
          </button>
        </div>
      )
    }

    if (activeOverlay === 'late_arrival') {
      return (
        <div className="flex flex-col gap-3">
          <select
            value={lateStaffPhone}
            onChange={(event) => setLateStaffPhone(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          >
            <option value="">Staff member</option>
            {assignments.map((row) => (
              <option key={row.staff_phone} value={row.staff_phone}>
                {row.staff_name}
              </option>
            ))}
          </select>
          <input
            type="datetime-local"
            value={lateArrivalTime}
            onChange={(event) => setLateArrivalTime(event.target.value)}
            className="rounded border border-gray-300 px-3 py-2"
          />
          <button
            type="button"
            disabled={overlayBusy}
            onClick={confirmLateArrival}
            className="min-h-14 rounded-lg bg-brand-navy text-white"
          >
            Log Late Arrival
          </button>
        </div>
      )
    }

    if (activeOverlay === 'quick_contact') {
      return (
        <div className="flex flex-col gap-3">
          <input
            type="search"
            value={contactQuery}
            onChange={(event) => setContactQuery(event.target.value)}
            placeholder="Search name or phone"
            className="rounded border border-gray-300 px-3 py-2"
          />
          <div className="max-h-48 overflow-y-auto">
            {filteredContacts.map((staff) => (
              <button
                key={staff.phone}
                type="button"
                onClick={() => setSelectedContact(staff)}
                className={`mb-2 flex w-full items-center justify-between rounded-lg border px-3 py-2 text-left ${
                  selectedContact?.phone === staff.phone
                    ? 'border-brand-navy bg-brand-light-blue'
                    : 'border-gray-200'
                }`}
              >
                <span>{staff.name}</span>
                <a href={`tel:${staff.phone}`} className="text-brand-navy">
                  Call
                </a>
              </button>
            ))}
          </div>
          <textarea
            value={contactMessage}
            onChange={(event) => setContactMessage(event.target.value)}
            placeholder="SMS message"
            className="rounded border border-gray-300 px-3 py-2"
            rows={3}
          />
          <button
            type="button"
            disabled={overlayBusy || !selectedContact}
            onClick={sendQuickContactSms}
            className="min-h-14 rounded-lg bg-brand-navy text-white"
          >
            Send SMS
          </button>
        </div>
      )
    }

    return null
  }

  const activeAction = ACTIONS.find((action) => action.id === activeOverlay)

  return (
    <div className="min-h-screen bg-white">
      <header style={{ backgroundColor: '#1B3A5C', padding: '14px 16px' }}>
        <div className="text-center text-white">
          <span style={{ fontSize: '16px', fontWeight: 600 }}>
            {gridMasterWordmark}
          </span>
          {hqWordmark ? (
            <span style={{ fontSize: '16px', fontWeight: 600, color: '#E74C3C' }}>
              {hqWordmark}
            </span>
          ) : null}
          <p style={{ fontSize: '12px', marginTop: '4px', color: '#D5E8F0' }}>
            {labels.command_center}
          </p>
        </div>
      </header>

      <section className="border-b border-gray-200 px-4 py-4">
        <p className="mb-3 text-sm font-medium text-text-body">
          Today&apos;s events
        </p>
        <div className="flex flex-wrap gap-3">
          {todayEvents.map((event) => (
            <button
              key={event.id}
              type="button"
              id={`event-section-${event.id}`}
              onClick={() => setActiveOverlay('status')}
              className="flex items-center gap-2 rounded-full border border-gray-200 px-3 py-2 text-sm"
            >
              <span
                className="size-3 rounded-full"
                style={{ backgroundColor: dotColor(event.status) }}
              />
              <span>{event.event_name}</span>
            </button>
          ))}
        </div>
      </section>

      <main className="px-4 py-4">
        <p className="mb-3 text-sm text-gray-500">{currentEventName}</p>
        <div className="flex flex-col gap-3">
          {ACTIONS.map((action) => {
            const ActionIcon = action.icon
            return (
              <button
                key={action.id}
                type="button"
                onClick={() => setActiveOverlay(action.id)}
                className="flex min-h-16 items-center gap-3 rounded-xl border border-gray-200 px-4 py-3 text-left"
              >
                <ActionIcon size={22} color="#1B3A5C" />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-text-body">{action.label}</p>
                  <p className="text-sm text-gray-500">{action.description}</p>
                </div>
                <IconChevronRight size={18} color="#9ca3af" />
              </button>
            )
          })}
        </div>
      </main>

      {activeOverlay ? (
        <div
          className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40"
          role="dialog"
          aria-modal="true"
        >
          <div className="max-h-[85vh] rounded-t-2xl bg-white p-4">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-brand-navy">
                {activeAction?.label}
              </h2>
              <button
                type="button"
                onClick={() => setActiveOverlay(null)}
                aria-label="Close"
                className="rounded p-1"
              >
                <IconX size={22} />
              </button>
            </div>
            {renderOverlayBody()}
          </div>
        </div>
      ) : null}
    </div>
  )
}
