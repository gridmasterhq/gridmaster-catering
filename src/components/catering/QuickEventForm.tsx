import { type FormEvent, useEffect, useState } from 'react'
import type { BEOExtractedData } from './BEOUpload'
import { useOverlay } from '../shared/AppShell'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

interface QuickEventFormProps {
  onSuccess: (eventId: string, eventName: string) => void
  onCancel: () => void
  initialValues?: BEOExtractedData
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

interface ClientSearchResult {
  id: string
  name: string
}

interface VenueSearchResult {
  id: string
  location_name: string
}

interface UniformPreset {
  id: string
  name: string
  description: string
}

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

export default function QuickEventForm({
  onSuccess,
  onCancel: _onCancel,
  initialValues,
}: QuickEventFormProps) {
  void _onCancel

  const { openOverlay } = useOverlay()
  const { labels, colors, event_types, service_styles } = useProductConfig()

  const [eventName, setEventName] = useState(initialValues?.event_name ?? '')
  const [clientName, setClientName] = useState(initialValues?.client_name ?? '')
  const [linkClient, setLinkClient] = useState(false)
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null)
  const [selectedClientName, setSelectedClientName] = useState('')
  const [clientSearchQuery, setClientSearchQuery] = useState('')
  const [clientSearchResults, setClientSearchResults] = useState<
    ClientSearchResult[]
  >([])
  const [clientSearchLoading, setClientSearchLoading] = useState(false)

  const [eventDate, setEventDate] = useState(initialValues?.event_date ?? '')
  const [eventStartTime, setEventStartTime] = useState(
    initialValues?.event_start_time ?? '',
  )
  const [startTimeTbd, setStartTimeTbd] = useState(
    !initialValues?.event_start_time,
  )

  const [venue, setVenue] = useState(initialValues?.venue_name ?? '')
  const [linkVenue, setLinkVenue] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(
    null,
  )
  const [selectedLocationName, setSelectedLocationName] = useState('')
  const [venueSearchQuery, setVenueSearchQuery] = useState('')
  const [venueSearchResults, setVenueSearchResults] = useState<
    VenueSearchResult[]
  >([])
  const [venueSearchLoading, setVenueSearchLoading] = useState(false)

  const [guestCount, setGuestCount] = useState(
    initialValues?.guest_count != null ? String(initialValues.guest_count) : '',
  )
  const [eventType, setEventType] = useState(() => {
    if (!initialValues?.event_type) {
      return ''
    }
    return event_types.some((type) => type.value === initialValues.event_type)
      ? initialValues.event_type
      : ''
  })
  const [serviceStyle, setServiceStyle] = useState(() => {
    if (!initialValues?.service_style) {
      return ''
    }
    return service_styles.some((style) => style.value === initialValues.service_style)
      ? initialValues.service_style
      : ''
  })
  const [totalStaffNeeded, setTotalStaffNeeded] = useState(
    initialValues?.total_staff_needed != null
      ? String(initialValues.total_staff_needed)
      : '',
  )
  const [selectedUniformId, setSelectedUniformId] = useState('')
  const [uniformPresets, setUniformPresets] = useState<UniformPreset[]>([])
  const [uniformPresetsLoaded, setUniformPresetsLoaded] = useState(false)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>({})
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.brand_navy,
  } as const

  const linkCheckboxLabelStyle = {
    fontSize: '11px',
    color: colors.text_muted,
  } as const

  const inlineNavLinkStyle = {
    fontSize: '13px',
    color: colors.brand_navy,
    background: 'none',
    border: 'none',
    cursor: 'pointer',
  } as const

  useEffect(() => {
    let cancelled = false

    async function loadOrganizationId() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (cancelled || error) {
        return
      }

      const id = user?.user_metadata?.organization_id
      if (typeof id === 'string' && id.trim().length > 0) {
        setOrganizationId(id.trim())
      }
    }

    void loadOrganizationId()

    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    if (!linkClient && !linkVenue) {
      return
    }

    let cancelled = false

    async function loadOrganizationIdForSearch() {
      const {
        data: { user },
        error,
      } = await supabase.auth.getUser()

      if (cancelled || error) {
        return
      }

      const id = user?.user_metadata?.organization_id
      if (typeof id === 'string' && id.trim().length > 0) {
        setOrganizationId(id.trim())
      }
    }

    void loadOrganizationIdForSearch()

    return () => {
      cancelled = true
    }
  }, [linkClient, linkVenue])

  useEffect(() => {
    if (!organizationId) {
      setUniformPresets([])
      setUniformPresetsLoaded(false)
      return
    }

    let cancelled = false

    async function loadUniformPresets() {
      setUniformPresetsLoaded(false)

      const { data, error } = await supabase
        .from('uniform_presets')
        .select('id, name, description')
        .eq('organization_id', organizationId)
        .order('sort_order', { ascending: true })
        .order('name', { ascending: true })

      if (cancelled) {
        return
      }

      if (error) {
        console.error('Failed to load uniform presets:', error)
        setUniformPresets([])
      } else {
        setUniformPresets(data ?? [])
      }

      setUniformPresetsLoaded(true)
    }

    void loadUniformPresets()

    return () => {
      cancelled = true
    }
  }, [organizationId])

  useEffect(() => {
    if (!linkClient || selectedClientId || !organizationId) {
      setClientSearchResults([])
      return
    }

    const query = clientSearchQuery.trim()
    if (query.length === 0) {
      setClientSearchResults([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setClientSearchLoading(true)

        const { data, error } = await supabase
          .from('clients')
          .select('id, name')
          .eq('organization_id', organizationId)
          .ilike('name', `%${query}%`)
          .limit(10)

        if (cancelled) {
          return
        }

        if (error) {
          console.error('Client search failed:', error)
          setClientSearchResults([])
        } else {
          setClientSearchResults(data ?? [])
        }

        setClientSearchLoading(false)
      })()
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [
    clientSearchQuery,
    linkClient,
    organizationId,
    selectedClientId,
  ])

  useEffect(() => {
    if (!linkVenue || selectedLocationId || !organizationId) {
      setVenueSearchResults([])
      return
    }

    const query = venueSearchQuery.trim()
    if (query.length === 0) {
      setVenueSearchResults([])
      return
    }

    let cancelled = false
    const timer = window.setTimeout(() => {
      void (async () => {
        setVenueSearchLoading(true)

        const { data, error } = await supabase
          .from('client_locations')
          .select('id, location_name')
          .eq('organization_id', organizationId)
          .ilike('location_name', `%${query}%`)
          .limit(10)

        if (cancelled) {
          return
        }

        if (error) {
          console.error('Venue search failed:', error)
          setVenueSearchResults([])
        } else {
          setVenueSearchResults(data ?? [])
        }

        setVenueSearchLoading(false)
      })()
    }, 300)

    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [linkVenue, organizationId, selectedLocationId, venueSearchQuery])

  const validate = (): boolean => {
    const next: Partial<Record<FieldKey, string>> = {}
    const required = labels.qe_field_required

    if (!eventName.trim()) {
      next.eventName = required
    }
    if (linkClient) {
      if (!selectedClientId) {
        next.clientName = required
      }
    } else if (!clientName.trim()) {
      next.clientName = required
    }
    if (!eventDate) {
      next.eventDate = required
    }
    if (!startTimeTbd && !eventStartTime) {
      next.eventStartTime = required
    }
    if (linkVenue) {
      if (!selectedLocationId) {
        next.venue = required
      }
    } else if (!venue.trim()) {
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

      const orgIdFromUser = user?.user_metadata?.organization_id

      if (
        typeof orgIdFromUser !== 'string' ||
        orgIdFromUser.trim().length === 0
      ) {
        throw new Error('Missing organization_id in user profile')
      }

      const organizationIdTrimmed = orgIdFromUser.trim()

      const { data, error } = await supabase
        .from('events')
        .insert({
          event_name: eventName.trim(),
          client_name:
            linkClient && selectedClientId ? null : clientName.trim(),
          client_id: linkClient && selectedClientId ? selectedClientId : null,
          event_date: eventDate,
          event_start_time: startTimeTbd ? null : eventStartTime,
          venue_name:
            linkVenue && selectedLocationId ? null : venue.trim(),
          location_id:
            linkVenue && selectedLocationId ? selectedLocationId : null,
          guest_count: parseInt(guestCount, 10),
          event_type: eventType,
          service_style: serviceStyle || null,
          total_staff_needed: parseInt(totalStaffNeeded, 10),
          organization_id: organizationIdTrimmed,
          status: 'draft',
        })
        .select('id')
        .single()

      if (error) {
        console.error('QuickEventForm insert failed:', error)
        throw error
      }

      if (!data?.id) {
        throw new Error('Event created but no ID returned')
      }

      onSuccess(data.id, eventName.trim())
    } catch (error) {
      console.error('QuickEventForm submit failed:', error)
      setSubmitError(getErrorMessage(error, 'Failed to create event'))
    } finally {
      setIsSubmitting(false)
    }
  }

  function clearClientSelection() {
    setSelectedClientId(null)
    setSelectedClientName('')
    setClientSearchQuery('')
    setClientSearchResults([])
  }

  function clearVenueSelection() {
    setSelectedLocationId(null)
    setSelectedLocationName('')
    setVenueSearchQuery('')
    setVenueSearchResults([])
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
        <div className="mb-1 flex items-center justify-between gap-3">
          <label htmlFor="qe-client-name" style={labelStyle}>
            {labels.qe_client_name}
          </label>
          <label
            className="flex shrink-0 cursor-pointer items-center gap-1"
            style={linkCheckboxLabelStyle}
          >
            <input
              type="checkbox"
              checked={linkClient}
              onChange={(e) => {
                const checked = e.target.checked
                setLinkClient(checked)
                clearClientSelection()
                if (!checked) {
                  setClientName('')
                }
                setFieldErrors((prev) => {
                  const next = { ...prev }
                  delete next.clientName
                  return next
                })
              }}
              disabled={isSubmitting}
              className="rounded border-gray-300"
            />
            {labels.qe_link_existing_client}
          </label>
        </div>
        {linkClient ? (
          selectedClientId ? (
            <div className="flex items-center gap-2">
              <input
                id="qe-client-name"
                type="text"
                readOnly
                value={selectedClientName}
                className={inputClassName}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={clearClientSelection}
                disabled={isSubmitting}
                className="shrink-0 text-xs text-gray-500 hover:text-gray-700"
              >
                {labels.qe_clear_selection}
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                id="qe-client-name"
                type="text"
                value={clientSearchQuery}
                onChange={(e) => setClientSearchQuery(e.target.value)}
                placeholder={labels.qe_search_client_placeholder}
                className={inputClassName}
                disabled={isSubmitting}
                autoComplete="off"
              />
              {clientSearchLoading ? (
                <p className="mt-1 text-xs text-gray-500">Searching...</p>
              ) : null}
              {clientSearchResults.length > 0 ? (
                <ul
                  className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-sm"
                  role="listbox"
                >
                  {clientSearchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => {
                          setSelectedClientId(result.id)
                          setSelectedClientName(result.name)
                          setClientSearchQuery('')
                          setClientSearchResults([])
                          setFieldErrors((prev) => {
                            const next = { ...prev }
                            delete next.clientName
                            return next
                          })
                        }}
                      >
                        {result.name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )
        ) : (
          <input
            id="qe-client-name"
            type="text"
            value={clientName}
            onChange={(e) => setClientName(e.target.value)}
            placeholder={labels.qe_client_name_placeholder}
            className={inputClassName}
            disabled={isSubmitting}
          />
        )}
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
        <div className="mb-1 flex items-center justify-between gap-3">
          <label htmlFor="qe-venue" style={labelStyle}>
            {labels.qe_venue}
          </label>
          <label
            className="flex shrink-0 cursor-pointer items-center gap-1"
            style={linkCheckboxLabelStyle}
          >
            <input
              type="checkbox"
              checked={linkVenue}
              onChange={(e) => {
                const checked = e.target.checked
                setLinkVenue(checked)
                clearVenueSelection()
                if (!checked) {
                  setVenue('')
                }
                setFieldErrors((prev) => {
                  const next = { ...prev }
                  delete next.venue
                  return next
                })
              }}
              disabled={isSubmitting}
              className="rounded border-gray-300"
            />
            {labels.qe_link_existing_venue}
          </label>
        </div>
        {linkVenue ? (
          selectedLocationId ? (
            <div className="flex items-center gap-2">
              <input
                id="qe-venue"
                type="text"
                readOnly
                value={selectedLocationName}
                className={inputClassName}
                disabled={isSubmitting}
              />
              <button
                type="button"
                onClick={clearVenueSelection}
                disabled={isSubmitting}
                className="shrink-0 text-xs text-gray-500 hover:text-gray-700"
              >
                {labels.qe_clear_selection}
              </button>
            </div>
          ) : (
            <div className="relative">
              <input
                id="qe-venue"
                type="text"
                value={venueSearchQuery}
                onChange={(e) => setVenueSearchQuery(e.target.value)}
                placeholder={labels.qe_search_venue_placeholder}
                className={inputClassName}
                disabled={isSubmitting}
                autoComplete="off"
              />
              {venueSearchLoading ? (
                <p className="mt-1 text-xs text-gray-500">Searching...</p>
              ) : null}
              {venueSearchResults.length > 0 ? (
                <ul
                  className="absolute z-10 mt-1 max-h-48 w-full overflow-y-auto rounded-lg border border-gray-300 bg-white shadow-sm"
                  role="listbox"
                >
                  {venueSearchResults.map((result) => (
                    <li key={result.id}>
                      <button
                        type="button"
                        className="w-full px-3 py-2 text-left text-sm hover:bg-gray-50"
                        onClick={() => {
                          setSelectedLocationId(result.id)
                          setSelectedLocationName(result.location_name)
                          setVenueSearchQuery('')
                          setVenueSearchResults([])
                          setFieldErrors((prev) => {
                            const next = { ...prev }
                            delete next.venue
                            return next
                          })
                        }}
                      >
                        {result.location_name}
                      </button>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          )
        ) : (
          <input
            id="qe-venue"
            type="text"
            value={venue}
            onChange={(e) => setVenue(e.target.value)}
            placeholder={labels.qe_venue_placeholder}
            className={inputClassName}
            disabled={isSubmitting}
          />
        )}
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
        <label htmlFor="qe-service-style" className="mb-1 block" style={labelStyle}>
          {labels.qe_service_style}
        </label>
        <select
          id="qe-service-style"
          value={serviceStyle}
          onChange={(e) => setServiceStyle(e.target.value)}
          className={inputClassName}
          disabled={isSubmitting}
        >
          <option value="">{labels.qe_select_service_style}</option>
          {service_styles.map((style) => (
            <option key={style.value} value={style.value}>
              {style.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="qe-uniform" className="mb-1 block" style={labelStyle}>
          {labels.form_uniform}
        </label>
        <select
          id="qe-uniform"
          value={selectedUniformId}
          onChange={(e) => setSelectedUniformId(e.target.value)}
          className={inputClassName}
          disabled={isSubmitting}
        >
          <option value="">{labels.form_select_uniform}</option>
          {uniformPresets.map((preset) => (
            <option key={preset.id} value={preset.id}>
              {preset.name}
            </option>
          ))}
        </select>
        {uniformPresetsLoaded && uniformPresets.length === 0 ? (
          <p
            className="mt-1"
            style={{ fontSize: '13px', color: colors.text_muted }}
          >
            {labels.form_no_uniform_presets_prefix}
            <button
              type="button"
              onClick={() => openOverlay('uniforms')}
              className="inline p-0 underline"
              style={inlineNavLinkStyle}
            >
              {labels.uniforms_heading}
            </button>
            {labels.form_no_uniform_presets_suffix}
          </p>
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
