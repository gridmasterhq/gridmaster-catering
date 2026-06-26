import { type FormEvent, useState } from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

interface QuickEventFormProps {
  onSuccess: (eventId: string) => void
  onCancel: () => void
}

type FieldKey =
  | 'eventName'
  | 'clientName'
  | 'eventDate'
  | 'eventStartTime'
  | 'venue'
  | 'guestCount'
  | 'eventType'
  | 'totalStaffNeeded'

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none'

function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof Error) {
    return error.message
  }

  if (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
  ) {
    return error.message
  }

  return fallback
}

async function findOrCreateClientId(
  organizationId: string,
  name: string,
): Promise<string> {
  const trimmedName = name.trim()

  const { data: existing, error: lookupError } = await supabase
    .from('clients')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('name', trimmedName)
    .maybeSingle()

  if (lookupError) {
    throw lookupError
  }

  if (existing?.id) {
    return existing.id
  }

  const { data: created, error: createError } = await supabase
    .from('clients')
    .insert({
      organization_id: organizationId,
      name: trimmedName,
    })
    .select('id')
    .single()

  if (createError) {
    throw createError
  }

  if (!created?.id) {
    throw new Error('Client created but no ID returned')
  }

  return created.id
}

async function findOrCreateLocationId(
  organizationId: string,
  clientId: string,
  locationName: string,
): Promise<string> {
  const trimmedName = locationName.trim()

  const { data: existing, error: lookupError } = await supabase
    .from('client_locations')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('client_id', clientId)
    .eq('location_name', trimmedName)
    .maybeSingle()

  if (lookupError) {
    throw lookupError
  }

  if (existing?.id) {
    return existing.id
  }

  const { data: created, error: createError } = await supabase
    .from('client_locations')
    .insert({
      organization_id: organizationId,
      client_id: clientId,
      location_name: trimmedName,
      address: trimmedName,
    })
    .select('id')
    .single()

  if (createError) {
    throw createError
  }

  if (!created?.id) {
    throw new Error('Venue location created but no ID returned')
  }

  return created.id
}

export default function QuickEventForm({
  onSuccess,
  onCancel: _onCancel,
}: QuickEventFormProps) {
  void _onCancel

  const { labels, colors, event_types } = useProductConfig()

  const [eventName, setEventName] = useState('')
  const [clientName, setClientName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [startTimeTbd, setStartTimeTbd] = useState(true)
  const [venue, setVenue] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [eventType, setEventType] = useState('')
  const [totalStaffNeeded, setTotalStaffNeeded] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.brand_navy,
  } as const

  const validate = (): boolean => {
    const next: Partial<Record<FieldKey, string>> = {}
    const required = labels.qe_field_required

    if (!eventName.trim()) {
      next.eventName = required
    }
    if (!clientName.trim()) {
      next.clientName = required
    }
    if (!eventDate) {
      next.eventDate = required
    }
    if (!startTimeTbd && !eventStartTime) {
      next.eventStartTime = required
    }
    if (!venue.trim()) {
      next.venue = required
    }
    if (guestCount === '') {
      next.guestCount = required
    } else {
      const count = Number(guestCount)
      if (Number.isNaN(count) || count <= 0) {
        next.guestCount = required
      }
    }
    if (!eventType) {
      next.eventType = required
    }
    if (totalStaffNeeded === '') {
      next.totalStaffNeeded = required
    } else {
      const staffCount = Number(totalStaffNeeded)
      if (Number.isNaN(staffCount) || staffCount < 0) {
        next.totalStaffNeeded = required
      }
    }

    setFieldErrors(next)
    return Object.keys(next).length === 0
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setSubmitError(null)

    if (!validate()) {
      return
    }

    setIsSubmitting(true)

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        throw userError
      }

      const organizationId = user?.user_metadata?.organization_id

      if (
        typeof organizationId !== 'string' ||
        organizationId.trim().length === 0
      ) {
        throw new Error('Missing organization_id in user profile')
      }

      const organizationIdTrimmed = organizationId.trim()

      const clientId = await findOrCreateClientId(
        organizationIdTrimmed,
        clientName,
      )
      const locationId = await findOrCreateLocationId(
        organizationIdTrimmed,
        clientId,
        venue,
      )

      const coreInsert = {
        event_name: eventName.trim(),
        client_id: clientId,
        location_id: locationId,
        event_date: eventDate,
        event_start_time: startTimeTbd ? null : eventStartTime,
        guest_count: parseInt(guestCount, 10),
        event_type: eventType,
        organization_id: organizationIdTrimmed,
        status: 'draft' as const,
      }

      const extendedInsert = {
        ...coreInsert,
        client_name: clientName.trim(),
        venue_name: venue.trim(),
        total_staff_needed: parseInt(totalStaffNeeded, 10),
      }

      let { data, error } = await supabase
        .from('events')
        .insert(extendedInsert)
        .select('id')
        .single()

      if (error?.code === 'PGRST204') {
        console.warn(
          'QuickEventForm: optional event columns missing, using core insert',
          error.message,
        )
        const retry = await supabase
          .from('events')
          .insert(coreInsert)
          .select('id')
          .single()
        data = retry.data
        error = retry.error
      }

      if (error) {
        console.error('QuickEventForm insert failed:', error)
        throw error
      }

      if (!data?.id) {
        throw new Error('Event created but no ID returned')
      }

      onSuccess(data.id)
    } catch (error) {
      console.error('QuickEventForm submit failed:', error)
      setSubmitError(getErrorMessage(error, 'Failed to create event'))
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="mx-auto flex w-full max-w-[480px] flex-col gap-4"
    >
      <div>
        <label htmlFor="qe-event-name" className="mb-1 block" style={labelStyle}>
          {labels.qe_event_name}
        </label>
        <input
          id="qe-event-name"
          type="text"
          value={eventName}
          onChange={(e) => setEventName(e.target.value)}
          placeholder={labels.qe_event_name_placeholder}
          className={inputClassName}
          disabled={isSubmitting}
        />
        {fieldErrors.eventName ? (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.eventName}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="qe-client-name" className="mb-1 block" style={labelStyle}>
          {labels.qe_client_name}
        </label>
        <input
          id="qe-client-name"
          type="text"
          value={clientName}
          onChange={(e) => setClientName(e.target.value)}
          placeholder={labels.qe_client_name_placeholder}
          className={inputClassName}
          disabled={isSubmitting}
        />
        {fieldErrors.clientName ? (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.clientName}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="qe-event-date" className="mb-1 block" style={labelStyle}>
          {labels.qe_event_date}
        </label>
        <input
          id="qe-event-date"
          type="date"
          value={eventDate}
          onChange={(e) => setEventDate(e.target.value)}
          className={inputClassName}
          disabled={isSubmitting}
        />
        {fieldErrors.eventDate ? (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.eventDate}</p>
        ) : null}
      </div>

      <div>
        <div className="mb-1 flex items-center justify-between gap-3">
          <label htmlFor="qe-event-start-time" style={labelStyle}>
            {labels.qe_event_start_time}
          </label>
          <label
            className="flex shrink-0 cursor-pointer items-center gap-1.5"
            style={{ fontSize: '13px', fontWeight: 500, color: colors.brand_navy }}
          >
            <input
              type="checkbox"
              checked={startTimeTbd}
              onChange={(e) => {
                setStartTimeTbd(e.target.checked)
                if (e.target.checked) {
                  setEventStartTime('')
                  setFieldErrors((prev) => {
                    const next = { ...prev }
                    delete next.eventStartTime
                    return next
                  })
                }
              }}
              disabled={isSubmitting}
              className="rounded border-gray-300"
            />
            {labels.qe_start_time_tbd}
          </label>
        </div>
        {!startTimeTbd ? (
          <input
            id="qe-event-start-time"
            type="time"
            value={eventStartTime}
            onChange={(e) => setEventStartTime(e.target.value)}
            className={inputClassName}
            disabled={isSubmitting}
          />
        ) : null}
        {fieldErrors.eventStartTime ? (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.eventStartTime}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="qe-venue" className="mb-1 block" style={labelStyle}>
          {labels.qe_venue}
        </label>
        <input
          id="qe-venue"
          type="text"
          value={venue}
          onChange={(e) => setVenue(e.target.value)}
          placeholder={labels.qe_venue_placeholder}
          className={inputClassName}
          disabled={isSubmitting}
        />
        {fieldErrors.venue ? (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.venue}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="qe-guest-count" className="mb-1 block" style={labelStyle}>
          {labels.qe_guest_count}
        </label>
        <input
          id="qe-guest-count"
          type="number"
          min={0}
          value={guestCount}
          onChange={(e) => setGuestCount(e.target.value)}
          placeholder={labels.qe_guest_count_placeholder}
          className={inputClassName}
          disabled={isSubmitting}
        />
        {fieldErrors.guestCount ? (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.guestCount}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="qe-event-type" className="mb-1 block" style={labelStyle}>
          {labels.qe_event_type}
        </label>
        <select
          id="qe-event-type"
          value={eventType}
          onChange={(e) => setEventType(e.target.value)}
          className={inputClassName}
          disabled={isSubmitting}
        >
          <option value="">{labels.qe_select_event_type}</option>
          {event_types.map((type) => (
            <option key={type.value} value={type.value}>
              {type.label}
            </option>
          ))}
        </select>
        {fieldErrors.eventType ? (
          <p className="mt-1 text-xs text-red-500">{fieldErrors.eventType}</p>
        ) : null}
      </div>

      <div>
        <label htmlFor="qe-total-staff" className="mb-1 block" style={labelStyle}>
          {labels.qe_total_staff_needed}
        </label>
        <input
          id="qe-total-staff"
          type="number"
          min={0}
          value={totalStaffNeeded}
          onChange={(e) => setTotalStaffNeeded(e.target.value)}
          placeholder={labels.qe_total_staff_placeholder}
          className={inputClassName}
          disabled={isSubmitting}
        />
        {fieldErrors.totalStaffNeeded ? (
          <p className="mt-1 text-xs text-red-500">
            {fieldErrors.totalStaffNeeded}
          </p>
        ) : null}
      </div>

      {submitError ? (
        <p className="text-sm text-red-500">{submitError}</p>
      ) : null}

      <button
        type="submit"
        disabled={isSubmitting}
        className="w-full rounded-lg py-3 font-semibold text-white disabled:opacity-60"
        style={{ backgroundColor: colors.brand_navy }}
      >
        {isSubmitting ? labels.qe_creating : labels.qe_create_event}
      </button>
    </form>
  )
}
