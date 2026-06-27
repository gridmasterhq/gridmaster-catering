import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { BEOExtractedData } from './BEOUpload'
import { useOverlay } from '../shared/AppShell'
import SaveAsTemplateCheckbox, {
  type SaveAsTemplateCheckboxHandle,
} from '../shared/SaveAsTemplateCheckbox'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { formatDateForInput } from '../../lib/dateUtils'
import { supabase } from '../../lib/supabase'
import type { EventTemplate } from '../../lib/types/eventTemplate'

interface ManualEntryFormProps {
  onSuccess: (eventId: string, eventName: string) => void
  onCancel: () => void
  initialValues?: BEOExtractedData
  prefilledDate?: Date
  initialTemplate?: EventTemplate
}

type FieldKey = 'eventName' | 'eventDate' | 'eventType'

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

interface NoteTemplate {
  id: string
  name: string
  description: string
}

const PLACEHOLDER_EVENT_ID = '00000000-0000-0000-0000-000000000000'
const CUSTOM_OPTION_VALUE = 'custom'
const NONE_OPTION_VALUE = 'none'

type CustomSelectionFieldName =
  | 'event_type'
  | 'service_style'
  | 'uniform'
  | 'note_template'
  | 'bar_service_type'

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

function SectionHeading({ children }: { children: string }) {
  const { colors } = useProductConfig()

  return (
    <h3
      className="mb-4"
      style={{
        fontSize: '13px',
        fontWeight: 600,
        textTransform: 'uppercase',
        letterSpacing: '0.06em',
        color: colors.text_muted,
      }}
    >
      {children}
    </h3>
  )
}

function SectionDivider() {
  return <hr className="border-gray-200" />
}

function FieldLabel({
  htmlFor,
  required,
  children,
}: {
  htmlFor: string
  required?: boolean
  children: ReactNode
}) {
  const { colors } = useProductConfig()

  return (
    <label
      htmlFor={htmlFor}
      className="mb-1 block"
      style={{
        fontSize: '13px',
        fontWeight: 500,
        color: colors.brand_navy,
      }}
    >
      {children}
      {required ? (
        <span style={{ color: colors.status_red }}> *</span>
      ) : null}
    </label>
  )
}

export default function ManualEntryForm({
  onSuccess,
  onCancel: _onCancel,
  initialValues,
  prefilledDate,
  initialTemplate,
}: ManualEntryFormProps) {
  void _onCancel

  const { openOverlay } = useOverlay()
  const {
    labels,
    colors,
    event_types,
    service_styles,
    bar_service_types,
    buffer_options,
    default_buffer_pct,
    default_alcohol_cutoff,
  } = useProductConfig()

  const templateRef = useRef<SaveAsTemplateCheckboxHandle>(null)
  const [templateEventId, setTemplateEventId] = useState(PLACEHOLDER_EVENT_ID)

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

  const [eventDate, setEventDate] = useState(
    initialValues?.event_date ??
      (prefilledDate ? formatDateForInput(prefilledDate) : ''),
  )
  const [eventStartTime, setEventStartTime] = useState(
    initialValues?.event_start_time ?? '',
  )
  const [startTimeTbd, setStartTimeTbd] = useState(
    !initialValues?.event_start_time,
  )
  const [eventEndTime, setEventEndTime] = useState('')
  const [endTimeTbd, setEndTimeTbd] = useState(true)

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
  const [eventTypeOtherText, setEventTypeOtherText] = useState('')
  const [serviceStyleCustom, setServiceStyleCustom] = useState('')

  const [venue, setVenue] = useState(initialValues?.venue_name ?? '')
  const [linkVenue, setLinkVenue] = useState(false)
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null)
  const [selectedLocationName, setSelectedLocationName] = useState('')
  const [venueSearchQuery, setVenueSearchQuery] = useState('')
  const [venueSearchResults, setVenueSearchResults] = useState<
    VenueSearchResult[]
  >([])
  const [venueSearchLoading, setVenueSearchLoading] = useState(false)
  const [address, setAddress] = useState('')
  const [arrivalNotes, setArrivalNotes] = useState('')

  const [guestCount, setGuestCount] = useState(
    initialValues?.guest_count != null ? String(initialValues.guest_count) : '',
  )
  const [totalStaffNeeded, setTotalStaffNeeded] = useState(
    initialValues?.total_staff_needed != null
      ? String(initialValues.total_staff_needed)
      : '',
  )
  const [bufferPct, setBufferPct] = useState(String(default_buffer_pct))
  const [staffNotes, setStaffNotes] = useState('')

  const [uniformNotes, setUniformNotes] = useState('')
  const [selectedUniformId, setSelectedUniformId] = useState('')
  const [uniformPresets, setUniformPresets] = useState<UniformPreset[]>([])
  const [uniformPresetsLoaded, setUniformPresetsLoaded] = useState(false)
  const [coordinatorNotes, setCoordinatorNotes] = useState(
    initialValues?.notes ?? '',
  )
  const [selectedNoteTemplateId, setSelectedNoteTemplateId] = useState('')
  const [noteTemplates, setNoteTemplates] = useState<NoteTemplate[]>([])
  const [noteTemplatesLoaded, setNoteTemplatesLoaded] = useState(false)
  const [barServiceType, setBarServiceType] = useState('')
  const [barServiceCustom, setBarServiceCustom] = useState('')
  const [alcoholCutoff, setAlcoholCutoff] = useState(default_alcohol_cutoff)
  const [vehicleDepartureTime, setVehicleDepartureTime] = useState('')
  const [vehicleLoadTime, setVehicleLoadTime] = useState('')

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<FieldKey, string>>>(
    {},
  )
  const [submitError, setSubmitError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

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

  const resolvedVenueName =
    linkVenue && selectedLocationName
      ? selectedLocationName
      : venue.trim() || labels.qe_venue_placeholder

  useEffect(() => {
    if (initialValues?.event_date || !prefilledDate) {
      return
    }
    setEventDate(formatDateForInput(prefilledDate))
  }, [initialValues?.event_date, prefilledDate])

  useEffect(() => {
    if (!initialTemplate) {
      return
    }

    if (
      initialTemplate.event_type &&
      event_types.some((type) => type.value === initialTemplate.event_type)
    ) {
      setEventType(initialTemplate.event_type)
    }

    if (initialTemplate.service_style) {
      const styleMatch = service_styles.find(
        (style) =>
          style.value === initialTemplate.service_style ||
          style.label.toLowerCase() ===
            initialTemplate.service_style?.toLowerCase(),
      )
      if (styleMatch) {
        setServiceStyle(styleMatch.value)
      }
    }

    if (initialTemplate.guest_count_default != null) {
      setGuestCount(String(initialTemplate.guest_count_default))
    }

    if (initialTemplate.total_staff_needed != null) {
      setTotalStaffNeeded(String(initialTemplate.total_staff_needed))
    }

    if (initialTemplate.venue_name) {
      setVenue(initialTemplate.venue_name)
    }

    if (initialTemplate.bar_service_type) {
      const barMatch = bar_service_types.find(
        (type) =>
          type.value === initialTemplate.bar_service_type ||
          type.label.toLowerCase() ===
            initialTemplate.bar_service_type?.toLowerCase(),
      )
      if (barMatch) {
        setBarServiceType(barMatch.value)
      }
    }

    if (initialTemplate.coordinator_notes) {
      setCoordinatorNotes(initialTemplate.coordinator_notes)
    }

    if (initialTemplate.uniform_preset_id) {
      setSelectedUniformId(initialTemplate.uniform_preset_id)
    }
  }, [
    initialTemplate,
    event_types,
    service_styles,
    bar_service_types,
  ])

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
    if (!organizationId) {
      setUniformPresets([])
      setUniformPresetsLoaded(false)
      setNoteTemplates([])
      setNoteTemplatesLoaded(false)
      return
    }

    let cancelled = false

    async function loadPresetsAndTemplates() {
      setUniformPresetsLoaded(false)
      setNoteTemplatesLoaded(false)

      const [uniformsResult, templatesResult] = await Promise.all([
        supabase
          .from('uniform_presets')
          .select('id, name, description')
          .eq('organization_id', organizationId)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
        supabase
          .from('note_templates')
          .select('id, name, description')
          .eq('organization_id', organizationId)
          .order('sort_order', { ascending: true })
          .order('name', { ascending: true }),
      ])

      if (cancelled) {
        return
      }

      if (uniformsResult.error) {
        console.error('Failed to load uniform presets:', uniformsResult.error)
        setUniformPresets([])
      } else {
        setUniformPresets(uniformsResult.data ?? [])
      }

      if (templatesResult.error) {
        console.error('Failed to load note templates:', templatesResult.error)
        setNoteTemplates([])
      } else {
        setNoteTemplates(templatesResult.data ?? [])
      }

      setUniformPresetsLoaded(true)
      setNoteTemplatesLoaded(true)
    }

    void loadPresetsAndTemplates()

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
  }, [clientSearchQuery, linkClient, organizationId, selectedClientId])

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
    if (!eventDate) {
      next.eventDate = required
    }
    if (!eventType) {
      next.eventType = required
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
      const trimmedEventName = eventName.trim()

      const trimmedAddress = address.trim()
      const trimmedUniformNotes = uniformNotes.trim()
      const trimmedCoordinatorNotes = coordinatorNotes.trim()
      const trimmedStaffNotes = staffNotes.trim()
      const trimmedBarServiceCustom = barServiceCustom.trim()
      const trimmedEventTypeOther = eventTypeOtherText.trim()
      const trimmedServiceStyleCustom = serviceStyleCustom.trim()

      const selectedUniformPreset =
        selectedUniformId &&
        selectedUniformId !== CUSTOM_OPTION_VALUE &&
        selectedUniformId !== NONE_OPTION_VALUE
          ? uniformPresets.find((preset) => preset.id === selectedUniformId)
          : undefined

      const selectedNoteTemplate =
        selectedNoteTemplateId &&
        selectedNoteTemplateId !== CUSTOM_OPTION_VALUE &&
        selectedNoteTemplateId !== NONE_OPTION_VALUE
          ? noteTemplates.find((template) => template.id === selectedNoteTemplateId)
          : undefined

      const { data, error } = await supabase
        .from('events')
        .insert({
          event_name: trimmedEventName,
          client_name:
            linkClient && selectedClientId ? null : clientName.trim() || null,
          client_id: linkClient && selectedClientId ? selectedClientId : null,
          event_date: eventDate,
          event_start_time: startTimeTbd ? null : eventStartTime || null,
          event_end_time: endTimeTbd ? null : eventEndTime || null,
          event_type: eventType,
          event_type_other_text:
            eventType === CUSTOM_OPTION_VALUE ? trimmedEventTypeOther || null : null,
          service_style: serviceStyle || null,
          service_style_custom:
            serviceStyle === CUSTOM_OPTION_VALUE
              ? trimmedServiceStyleCustom || null
              : null,
          venue_name:
            linkVenue && selectedLocationId ? null : venue.trim() || null,
          location_id:
            linkVenue && selectedLocationId ? selectedLocationId : null,
          address: trimmedAddress || null,
          arrival_notes: arrivalNotes.trim() || null,
          guest_count:
            guestCount.trim() === '' ? null : Number.parseInt(guestCount, 10),
          total_staff_needed:
            totalStaffNeeded.trim() === ''
              ? null
              : Number.parseInt(totalStaffNeeded, 10),
          buffer_percentage: Number.parseInt(bufferPct, 10),
          staff_notes: trimmedStaffNotes || null,
          uniform_preset_id: selectedUniformPreset?.id ?? null,
          uniform_custom_text:
            selectedUniformId === CUSTOM_OPTION_VALUE
              ? trimmedUniformNotes || null
              : null,
          uniform_notes: selectedUniformPreset?.description ?? null,
          note_template_id: selectedNoteTemplate?.id ?? null,
          coordinator_notes_custom:
            selectedNoteTemplateId === CUSTOM_OPTION_VALUE
              ? trimmedCoordinatorNotes || null
              : null,
          coordinator_notes: selectedNoteTemplate?.description ?? null,
          bar_service_type: barServiceType || null,
          bar_service_custom:
            barServiceType === CUSTOM_OPTION_VALUE
              ? trimmedBarServiceCustom || null
              : null,
          alcohol_cutoff_enabled: alcoholCutoff,
          vehicle_departure_time: vehicleDepartureTime || null,
          vehicle_load_time: vehicleLoadTime || null,
          organization_id: organizationIdTrimmed,
          status: 'draft',
        })
        .select('id')
        .single()

      if (error) {
        console.error('ManualEntryForm insert failed:', error)
        throw error
      }

      if (!data?.id) {
        throw new Error('Event created but no ID returned')
      }

      const customSelectionRecords: Array<{
        organization_id: string
        field_name: CustomSelectionFieldName
        custom_text: string
        event_id: string
      }> = []

      if (eventType === CUSTOM_OPTION_VALUE) {
        customSelectionRecords.push({
          organization_id: organizationIdTrimmed,
          field_name: 'event_type',
          custom_text: trimmedEventTypeOther,
          event_id: data.id,
        })
      }

      if (serviceStyle === CUSTOM_OPTION_VALUE) {
        customSelectionRecords.push({
          organization_id: organizationIdTrimmed,
          field_name: 'service_style',
          custom_text: trimmedServiceStyleCustom,
          event_id: data.id,
        })
      }

      if (selectedUniformId === CUSTOM_OPTION_VALUE) {
        customSelectionRecords.push({
          organization_id: organizationIdTrimmed,
          field_name: 'uniform',
          custom_text: trimmedUniformNotes,
          event_id: data.id,
        })
      }

      if (selectedNoteTemplateId === CUSTOM_OPTION_VALUE) {
        customSelectionRecords.push({
          organization_id: organizationIdTrimmed,
          field_name: 'note_template',
          custom_text: trimmedCoordinatorNotes,
          event_id: data.id,
        })
      }

      if (barServiceType === CUSTOM_OPTION_VALUE) {
        customSelectionRecords.push({
          organization_id: organizationIdTrimmed,
          field_name: 'bar_service_type',
          custom_text: trimmedBarServiceCustom,
          event_id: data.id,
        })
      }

      if (customSelectionRecords.length > 0) {
        const { error: trackingError } = await supabase
          .from('custom_selection_events')
          .insert(customSelectionRecords)

        if (trackingError) {
          console.error('Failed to log custom selections:', trackingError)
        }
      }

      setTemplateEventId(data.id)
      await new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => resolve())
      })
      await templateRef.current?.saveTemplate()

      onSuccess(data.id, trimmedEventName)
    } catch (error) {
      console.error('ManualEntryForm submit failed:', error)
      setSubmitError(getErrorMessage(error, labels.me_submit_error_fallback))
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
      className="mx-auto flex w-full max-w-[600px] flex-col gap-6"
    >
      <section>
        <SectionHeading>{labels.me_section_event_basics}</SectionHeading>
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel htmlFor="me-event-name" required>
              {labels.qe_event_name}
            </FieldLabel>
            <input
              id="me-event-name"
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
              <FieldLabel htmlFor="me-client-name">{labels.qe_client_name}</FieldLabel>
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
                    id="me-client-name"
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
                    id="me-client-name"
                    type="text"
                    value={clientSearchQuery}
                    onChange={(e) => setClientSearchQuery(e.target.value)}
                    placeholder={labels.qe_search_client_placeholder}
                    className={inputClassName}
                    disabled={isSubmitting}
                    autoComplete="off"
                  />
                  {clientSearchLoading ? (
                    <p className="mt-1 text-xs text-gray-500">{labels.me_searching}</p>
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
                id="me-client-name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={labels.qe_client_name_placeholder}
                className={inputClassName}
                disabled={isSubmitting}
              />
            )}
          </div>

          <div>
            <FieldLabel htmlFor="me-event-date" required>
              {labels.qe_event_date}
            </FieldLabel>
            <input
              id="me-event-date"
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
              <FieldLabel htmlFor="me-event-start-time">
                {labels.qe_event_start_time}
              </FieldLabel>
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
                id="me-event-start-time"
                type="time"
                value={eventStartTime}
                onChange={(e) => setEventStartTime(e.target.value)}
                className={inputClassName}
                disabled={isSubmitting}
              />
            ) : null}
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <FieldLabel htmlFor="me-event-end-time">
                {labels.me_event_end_time}
              </FieldLabel>
              <label
                className="flex shrink-0 cursor-pointer items-center gap-1.5"
                style={{ fontSize: '13px', fontWeight: 500, color: colors.brand_navy }}
              >
                <input
                  type="checkbox"
                  checked={endTimeTbd}
                  onChange={(e) => {
                    setEndTimeTbd(e.target.checked)
                    if (e.target.checked) {
                      setEventEndTime('')
                    }
                  }}
                  disabled={isSubmitting}
                  className="rounded border-gray-300"
                />
                {labels.me_end_time_tbd}
              </label>
            </div>
            {!endTimeTbd ? (
              <input
                id="me-event-end-time"
                type="time"
                value={eventEndTime}
                onChange={(e) => setEventEndTime(e.target.value)}
                className={inputClassName}
                disabled={isSubmitting}
              />
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor="me-event-type" required>
              {labels.qe_event_type}
            </FieldLabel>
            <select
              id="me-event-type"
              value={eventType}
              onChange={(e) => {
                const value = e.target.value
                setEventType(value)
                if (value !== CUSTOM_OPTION_VALUE) {
                  setEventTypeOtherText('')
                }
              }}
              className={inputClassName}
              disabled={isSubmitting}
            >
              <option value="">{labels.qe_select_event_type}</option>
              {event_types
                .filter((type) => type.value !== CUSTOM_OPTION_VALUE)
                .map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              <option value={CUSTOM_OPTION_VALUE}>{labels.roles_uniform_custom}</option>
            </select>
            {eventType === CUSTOM_OPTION_VALUE ? (
              <div className="mt-2">
                <FieldLabel htmlFor="me-event-type-other">
                  {labels.me_event_type_other_label}
                </FieldLabel>
                <input
                  id="me-event-type-other"
                  type="text"
                  value={eventTypeOtherText}
                  onChange={(e) => setEventTypeOtherText(e.target.value)}
                  placeholder={labels.me_event_type_other_placeholder}
                  className={inputClassName}
                  disabled={isSubmitting}
                />
              </div>
            ) : null}
            {fieldErrors.eventType ? (
              <p className="mt-1 text-xs text-red-500">{fieldErrors.eventType}</p>
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor="me-service-style">{labels.qe_service_style}</FieldLabel>
            <select
              id="me-service-style"
              value={serviceStyle}
              onChange={(e) => {
                const value = e.target.value
                setServiceStyle(value)
                if (value !== CUSTOM_OPTION_VALUE) {
                  setServiceStyleCustom('')
                }
              }}
              className={inputClassName}
              disabled={isSubmitting}
            >
              <option value="">{labels.qe_select_service_style}</option>
              {service_styles
                .filter((style) => style.value !== CUSTOM_OPTION_VALUE)
                .map((style) => (
                  <option key={style.value} value={style.value}>
                    {style.label}
                  </option>
                ))}
              <option value={CUSTOM_OPTION_VALUE}>{labels.roles_uniform_custom}</option>
            </select>
            {serviceStyle === CUSTOM_OPTION_VALUE ? (
              <textarea
                id="me-service-style-custom"
                value={serviceStyleCustom}
                onChange={(e) => setServiceStyleCustom(e.target.value)}
                placeholder={labels.me_service_style_custom_placeholder}
                rows={3}
                className={`${inputClassName} mt-2`}
                disabled={isSubmitting}
              />
            ) : null}
          </div>
        </div>
      </section>

      <SectionDivider />

      <section>
        <SectionHeading>{labels.me_section_venue}</SectionHeading>
        <div className="flex flex-col gap-4">
          <div>
            <div className="mb-1 flex items-center justify-between gap-3">
              <FieldLabel htmlFor="me-venue">{labels.qe_venue}</FieldLabel>
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
                    id="me-venue"
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
                    id="me-venue"
                    type="text"
                    value={venueSearchQuery}
                    onChange={(e) => setVenueSearchQuery(e.target.value)}
                    placeholder={labels.qe_search_venue_placeholder}
                    className={inputClassName}
                    disabled={isSubmitting}
                    autoComplete="off"
                  />
                  {venueSearchLoading ? (
                    <p className="mt-1 text-xs text-gray-500">{labels.me_searching}</p>
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
                id="me-venue"
                type="text"
                value={venue}
                onChange={(e) => setVenue(e.target.value)}
                placeholder={labels.qe_venue_placeholder}
                className={inputClassName}
                disabled={isSubmitting}
              />
            )}
          </div>

          <div>
            <FieldLabel htmlFor="me-address">{labels.me_address}</FieldLabel>
            <input
              id="me-address"
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={labels.me_address_placeholder}
              className={inputClassName}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <FieldLabel htmlFor="me-arrival-notes">{labels.me_arrival_notes}</FieldLabel>
            <textarea
              id="me-arrival-notes"
              value={arrivalNotes}
              onChange={(e) => setArrivalNotes(e.target.value)}
              placeholder={labels.me_arrival_notes_placeholder}
              rows={3}
              className={inputClassName}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </section>

      <SectionDivider />

      <section>
        <SectionHeading>{labels.me_section_guest_staffing}</SectionHeading>
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel htmlFor="me-guest-count">{labels.qe_guest_count}</FieldLabel>
            <input
              id="me-guest-count"
              type="number"
              min={0}
              value={guestCount}
              onChange={(e) => setGuestCount(e.target.value)}
              placeholder={labels.qe_guest_count_placeholder}
              className={inputClassName}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <FieldLabel htmlFor="me-total-staff">{labels.qe_total_staff_needed}</FieldLabel>
            <input
              id="me-total-staff"
              type="number"
              min={0}
              value={totalStaffNeeded}
              onChange={(e) => setTotalStaffNeeded(e.target.value)}
              placeholder={labels.qe_total_staff_placeholder}
              className={inputClassName}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <FieldLabel htmlFor="me-buffer-pct">{labels.me_buffer_pct}</FieldLabel>
            <select
              id="me-buffer-pct"
              value={bufferPct}
              onChange={(e) => setBufferPct(e.target.value)}
              className={inputClassName}
              disabled={isSubmitting}
            >
              {buffer_options.map((option) => (
                <option key={option} value={String(option)}>
                  {option}%
                </option>
              ))}
            </select>
          </div>

          <div>
            <FieldLabel htmlFor="me-staff-notes">{labels.me_staff_notes}</FieldLabel>
            <textarea
              id="me-staff-notes"
              value={staffNotes}
              onChange={(e) => setStaffNotes(e.target.value)}
              placeholder={labels.me_staff_notes_placeholder}
              rows={3}
              className={inputClassName}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </section>

      <SectionDivider />

      <section>
        <SectionHeading>{labels.me_section_event_details}</SectionHeading>
        <div className="flex flex-col gap-4">
          <div>
            <FieldLabel htmlFor="me-uniform">{labels.form_uniform}</FieldLabel>
            <select
              id="me-uniform"
              value={selectedUniformId}
              onChange={(e) => {
                const value = e.target.value
                setSelectedUniformId(value)
                if (value !== CUSTOM_OPTION_VALUE) {
                  setUniformNotes('')
                }
              }}
              className={inputClassName}
              disabled={isSubmitting}
            >
              <option value="">{labels.form_select_uniform}</option>
              {uniformPresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
              <option value={NONE_OPTION_VALUE}>{labels.form_none}</option>
              <option value={CUSTOM_OPTION_VALUE}>{labels.roles_uniform_custom}</option>
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
            {selectedUniformId === CUSTOM_OPTION_VALUE ? (
              <textarea
                id="me-uniform-custom"
                value={uniformNotes}
                onChange={(e) => setUniformNotes(e.target.value)}
                placeholder={labels.me_uniform_custom_placeholder}
                rows={3}
                className={`${inputClassName} mt-2`}
                disabled={isSubmitting}
              />
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor="me-note-template">
              {labels.form_note_template}
            </FieldLabel>
            <select
              id="me-note-template"
              value={selectedNoteTemplateId}
              onChange={(e) => {
                const value = e.target.value
                setSelectedNoteTemplateId(value)
                if (value !== CUSTOM_OPTION_VALUE) {
                  setCoordinatorNotes('')
                }
              }}
              className={inputClassName}
              disabled={isSubmitting}
            >
              <option value="">{labels.form_select_note_template}</option>
              {noteTemplates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
              <option value={NONE_OPTION_VALUE}>{labels.form_none}</option>
              <option value={CUSTOM_OPTION_VALUE}>{labels.roles_uniform_custom}</option>
            </select>
            {noteTemplatesLoaded && noteTemplates.length === 0 ? (
              <p
                className="mt-1"
                style={{ fontSize: '13px', color: colors.text_muted }}
              >
                {labels.form_no_note_templates_prefix}
                <button
                  type="button"
                  onClick={() => openOverlay('note-templates')}
                  className="inline p-0 underline"
                  style={inlineNavLinkStyle}
                >
                  {labels.note_templates_heading}
                </button>
                {labels.form_no_note_templates_suffix}
              </p>
            ) : null}
            {selectedNoteTemplateId === CUSTOM_OPTION_VALUE ? (
              <textarea
                id="me-coordinator-notes"
                value={coordinatorNotes}
                onChange={(e) => setCoordinatorNotes(e.target.value)}
                placeholder={labels.me_coordinator_notes_custom_placeholder}
                rows={3}
                className={`${inputClassName} mt-2`}
                disabled={isSubmitting}
              />
            ) : null}
          </div>

          <div>
            <FieldLabel htmlFor="me-bar-service-type">
              {labels.me_bar_service_type}
            </FieldLabel>
            <select
              id="me-bar-service-type"
              value={barServiceType}
              onChange={(e) => {
                const value = e.target.value
                setBarServiceType(value)
                if (value !== CUSTOM_OPTION_VALUE) {
                  setBarServiceCustom('')
                }
              }}
              className={inputClassName}
              disabled={isSubmitting}
            >
              <option value="">{labels.me_select_bar_service_type}</option>
              {bar_service_types
                .filter((type) => type.value !== CUSTOM_OPTION_VALUE)
                .map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              <option value={CUSTOM_OPTION_VALUE}>{labels.roles_uniform_custom}</option>
            </select>
            {barServiceType === CUSTOM_OPTION_VALUE ? (
              <textarea
                id="me-bar-service-custom"
                value={barServiceCustom}
                onChange={(e) => setBarServiceCustom(e.target.value)}
                placeholder={labels.me_bar_service_custom_placeholder}
                rows={3}
                className={`${inputClassName} mt-2`}
                disabled={isSubmitting}
              />
            ) : null}
          </div>

          <div>
            <label
              className="flex cursor-pointer items-center gap-3"
              style={{ fontSize: '13px', fontWeight: 500, color: colors.brand_navy }}
            >
              <input
                type="checkbox"
                checked={alcoholCutoff}
                onChange={(e) => setAlcoholCutoff(e.target.checked)}
                disabled={isSubmitting}
                className="rounded border-gray-300"
              />
              {labels.me_alcohol_cutoff}
            </label>
          </div>

          <div>
            <FieldLabel htmlFor="me-vehicle-departure">
              {labels.me_vehicle_departure_time}
            </FieldLabel>
            <input
              id="me-vehicle-departure"
              type="time"
              value={vehicleDepartureTime}
              onChange={(e) => setVehicleDepartureTime(e.target.value)}
              className={inputClassName}
              disabled={isSubmitting}
            />
          </div>

          <div>
            <FieldLabel htmlFor="me-vehicle-load">{labels.me_vehicle_load_time}</FieldLabel>
            <input
              id="me-vehicle-load"
              type="time"
              value={vehicleLoadTime}
              onChange={(e) => setVehicleLoadTime(e.target.value)}
              className={inputClassName}
              disabled={isSubmitting}
            />
          </div>
        </div>
      </section>

      <SectionDivider />

      <section>
        <SectionHeading>{labels.me_section_save_options}</SectionHeading>
        <SaveAsTemplateCheckbox
          ref={templateRef}
          event_id={templateEventId}
          organization_id={organizationId ?? ''}
          event_type={eventType || 'custom'}
          venue_name={resolvedVenueName}
        />
      </section>

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
