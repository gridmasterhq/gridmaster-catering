import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconAlertTriangle, IconArrowLeft, IconFileUpload } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { formatDateDisplay, formatDateForInput } from '../../lib/dateUtils'
import { supabase } from '../../lib/supabase'

export interface BEOExtractedData {
  event_name?: string
  client_name?: string
  event_date?: string
  event_start_time?: string
  venue_name?: string
  guest_count?: number
  event_type?: string
  service_style?: string
  total_staff_needed?: number
  notes?: string
}

interface BEOUploadProps {
  onSuccess: (extractedData: BEOExtractedData) => void
  onCancel: () => void
  prefilledDate?: Date
}

type UploadState = 'upload' | 'processing' | 'review' | 'error'

const ACCEPTED_FILE_TYPES = '.pdf,image/*'
const ANTHROPIC_API_URL = 'https://api.anthropic.com/v1/messages'
const ANTHROPIC_MODEL = 'claude-sonnet-4-6'

const inputClassName =
  'w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:border-brand-navy focus:ring-2 focus:ring-brand-navy focus:outline-none'

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result !== 'string') {
        reject(new Error('Failed to read file'))
        return
      }
      const base64 = result.split(',')[1]
      if (!base64) {
        reject(new Error('Failed to encode file'))
        return
      }
      resolve(base64)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read file'))
    reader.readAsDataURL(file)
  })
}

function isPdfFile(file: File): boolean {
  return (
    file.type === 'application/pdf' ||
    file.name.toLowerCase().endsWith('.pdf')
  )
}

function parseAnthropicJson(text: string): BEOExtractedData {
  const trimmed = text.trim()
  const fencedMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/)
  const jsonStr = fencedMatch ? fencedMatch[1].trim() : trimmed
  return JSON.parse(jsonStr) as BEOExtractedData
}

function toReviewString(value: string | number | undefined | null): string {
  if (value === undefined || value === null) {
    return ''
  }
  return String(value)
}

export default function BEOUpload({
  onSuccess,
  onCancel,
  prefilledDate,
}: BEOUploadProps) {
  const { labels, colors, event_types, service_styles } = useProductConfig()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const prefilledDateValue = useMemo(
    () => (prefilledDate ? formatDateForInput(prefilledDate) : ''),
    [prefilledDate],
  )

  const [uploadState, setUploadState] = useState<UploadState>('upload')
  const [uploadedFileName, setUploadedFileName] = useState('')
  const [isDragOver, setIsDragOver] = useState(false)

  const [eventName, setEventName] = useState('')
  const [clientName, setClientName] = useState('')
  const [eventDate, setEventDate] = useState('')
  const [eventStartTime, setEventStartTime] = useState('')
  const [venueName, setVenueName] = useState('')
  const [guestCount, setGuestCount] = useState('')
  const [eventType, setEventType] = useState('')
  const [serviceStyle, setServiceStyle] = useState('')
  const [totalStaffNeeded, setTotalStaffNeeded] = useState('')
  const [notes, setNotes] = useState('')
  const [dateMismatch, setDateMismatch] = useState<{ extractedDate: string } | null>(
    null,
  )

  const mismatchButtonStyle = {
    border: '1px solid #854D0E',
    background: 'white',
    color: '#854D0E',
    borderRadius: '4px',
    padding: '4px 10px',
    fontSize: '12px',
    cursor: 'pointer',
  } as const

  const labelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.brand_navy,
  } as const

  const resetReviewFields = useCallback(() => {
    setEventName('')
    setClientName('')
    setEventDate('')
    setEventStartTime('')
    setVenueName('')
    setGuestCount('')
    setEventType('')
    setServiceStyle('')
    setTotalStaffNeeded('')
    setNotes('')
    setDateMismatch(null)
  }, [])

  const applyExtractedData = useCallback((data: BEOExtractedData) => {
    const allowedEventTypes = new Set(event_types.map((type) => type.value))
    const allowedServiceStyles = new Set(service_styles.map((style) => style.value))
    const extractedDate = toReviewString(data.event_date)
    const hasMismatch =
      Boolean(prefilledDate) &&
      Boolean(extractedDate) &&
      extractedDate !== prefilledDateValue

    setEventName(toReviewString(data.event_name))
    setClientName(toReviewString(data.client_name))
    setEventStartTime(toReviewString(data.event_start_time))
    setVenueName(toReviewString(data.venue_name))
    setGuestCount(toReviewString(data.guest_count))
    setEventType(
      data.event_type && allowedEventTypes.has(data.event_type)
        ? data.event_type
        : '',
    )
    setServiceStyle(
      data.service_style && allowedServiceStyles.has(data.service_style)
        ? data.service_style
        : '',
    )
    setTotalStaffNeeded(toReviewString(data.total_staff_needed))
    setNotes(toReviewString(data.notes))

    if (hasMismatch) {
      setDateMismatch({ extractedDate })
      setEventDate(prefilledDateValue)
      return
    }

    setDateMismatch(null)
    setEventDate(extractedDate || prefilledDateValue)
  }, [event_types, prefilledDate, prefilledDateValue, service_styles])

  useEffect(() => {
    if (!prefilledDateValue) {
      return
    }
    setEventDate((current) => current || prefilledDateValue)
  }, [prefilledDateValue])

  const uploadToStorage = useCallback(async (file: File) => {
    const {
      data: { user },
    } = await supabase.auth.getUser()

    const userSegment = user?.id ?? 'anonymous'
    const filePath = `${userSegment}/${Date.now()}-${file.name}`

    const { error } = await supabase.storage
      .from('beo-uploads')
      .upload(filePath, file)

    if (error) {
      console.error('BEO storage upload failed:', error)
    }
  }, [])

  const extractFromFile = useCallback(
    async (file: File) => {
      const apiKey = import.meta.env.VITE_ANTHROPIC_API_KEY
      if (!apiKey) {
        throw new Error('Missing VITE_ANTHROPIC_API_KEY')
      }

      const base64 = await fileToBase64(file)
      const isPdf = isPdfFile(file)

      const contentBlock = isPdf
        ? {
            type: 'document' as const,
            source: {
              type: 'base64' as const,
              media_type: 'application/pdf' as const,
              data: base64,
            },
          }
        : {
            type: 'image' as const,
            source: {
              type: 'base64' as const,
              media_type: file.type || 'image/jpeg',
              data: base64,
            },
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
          max_tokens: 1024,
          system: labels.beo_extraction_system_prompt,
          messages: [
            {
              role: 'user',
              content: [contentBlock],
            },
          ],
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

      return parseAnthropicJson(textBlock.text)
    },
    [labels.beo_extraction_system_prompt],
  )

  const processFile = useCallback(
    async (file: File) => {
      setUploadedFileName(file.name)
      setUploadState('processing')

      try {
        await uploadToStorage(file)
        const extracted = await extractFromFile(file)
        applyExtractedData(extracted)
        setUploadState('review')
      } catch (error) {
        console.error('BEO extraction failed:', error)
        setUploadState('error')
      }
    },
    [applyExtractedData, extractFromFile, uploadToStorage],
  )

  const handleFileSelection = useCallback(
    (fileList: FileList | null) => {
      const file = fileList?.[0]
      if (!file) {
        return
      }

      const isAccepted =
        isPdfFile(file) || file.type.startsWith('image/')

      if (!isAccepted) {
        return
      }

      void processFile(file)
    },
    [processFile],
  )

  const handleStartOver = () => {
    resetReviewFields()
    setUploadedFileName('')
    setUploadState('upload')
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const handleConfirm = () => {
    const parsedGuestCount =
      guestCount.trim() === '' ? undefined : Number.parseInt(guestCount, 10)
    const parsedStaffCount =
      totalStaffNeeded.trim() === ''
        ? undefined
        : Number.parseInt(totalStaffNeeded, 10)

    onSuccess({
      event_name: eventName.trim() || undefined,
      client_name: clientName.trim() || undefined,
      event_date: eventDate || undefined,
      event_start_time: eventStartTime || undefined,
      venue_name: venueName.trim() || undefined,
      guest_count:
        parsedGuestCount !== undefined && !Number.isNaN(parsedGuestCount)
          ? parsedGuestCount
          : undefined,
      event_type: eventType || undefined,
      service_style: serviceStyle || undefined,
      total_staff_needed:
        parsedStaffCount !== undefined && !Number.isNaN(parsedStaffCount)
          ? parsedStaffCount
          : undefined,
      notes: notes.trim() || undefined,
    })
  }

  const cancelButton = (
    <button
      type="button"
      onClick={onCancel}
      className="mb-6 flex items-center gap-2 self-start"
      style={{ color: colors.brand_navy }}
    >
      <IconArrowLeft size={20} stroke={2} />
      <span style={{ fontSize: '14px', fontWeight: 500 }}>{labels.ne_cancel}</span>
    </button>
  )

  if (uploadState === 'processing') {
    return (
      <div
        className="flex min-h-screen flex-col px-4 py-6"
        style={{ backgroundColor: colors.brand_light_blue }}
      >
        <div className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center text-center">
          <p
            className="mb-6 font-medium"
            style={{ fontSize: '14px', color: colors.text_body }}
          >
            {uploadedFileName}
          </p>
          <div
            className="mb-6 size-10 rounded-full border-4 border-t-transparent"
            style={{
              borderColor: colors.brand_navy,
              borderTopColor: 'transparent',
              animation: 'beo-spin 0.8s linear infinite',
            }}
            aria-hidden="true"
          />
          <p
            style={{
              fontSize: '18px',
              fontWeight: 600,
              color: colors.brand_navy,
            }}
          >
            {labels.beo_processing_heading}
          </p>
          <p
            className="mt-2"
            style={{ fontSize: '14px', color: colors.text_muted }}
          >
            {labels.beo_processing_subtext}
          </p>
        </div>
        <style>{`@keyframes beo-spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    )
  }

  if (uploadState === 'error') {
    return (
      <div
        className="flex min-h-screen flex-col px-4 py-6"
        style={{ backgroundColor: colors.brand_light_blue }}
      >
        {cancelButton}
        <div
          className="mx-auto flex w-full max-w-[480px] flex-1 flex-col items-center justify-center rounded-lg border border-gray-200 p-8 text-center shadow-sm"
          style={{ backgroundColor: colors.white }}
        >
          <p style={{ fontSize: '16px', color: colors.text_body }}>
            {labels.beo_error_message}
          </p>
          <div className="mt-6 flex w-full flex-col gap-3">
            <button
              type="button"
              onClick={handleStartOver}
              className="w-full rounded-lg py-3 text-sm font-semibold text-white"
              style={{ backgroundColor: colors.brand_navy }}
            >
              {labels.beo_try_again}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="w-full text-sm hover:underline"
              style={{ color: colors.text_muted }}
            >
              {labels.beo_enter_manually}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (uploadState === 'review') {
    return (
      <div
        className="flex min-h-screen flex-col px-4 py-6"
        style={{ backgroundColor: colors.brand_light_blue }}
      >
        <div className="mx-auto w-full max-w-[480px] flex-1">
          <h2
            style={{
              fontSize: '20px',
              fontWeight: 600,
              color: colors.brand_navy,
            }}
          >
            {labels.beo_review_heading}
          </h2>
          <p
            className="mt-2 mb-6"
            style={{ fontSize: '14px', color: colors.text_muted }}
          >
            {labels.beo_review_subtext}
          </p>

          <div className="flex flex-col gap-4">
            <div>
              <label htmlFor="beo-event-name" className="mb-1 block" style={labelStyle}>
                {labels.qe_event_name}
              </label>
              <input
                id="beo-event-name"
                type="text"
                value={eventName}
                onChange={(e) => setEventName(e.target.value)}
                placeholder={labels.qe_event_name_placeholder}
                className={inputClassName}
              />
            </div>

            <div>
              <label htmlFor="beo-client-name" className="mb-1 block" style={labelStyle}>
                {labels.qe_client_name}
              </label>
              <input
                id="beo-client-name"
                type="text"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                placeholder={labels.qe_client_name_placeholder}
                className={inputClassName}
              />
            </div>

            <div>
              <label htmlFor="beo-event-date" className="mb-1 block" style={labelStyle}>
                {labels.qe_event_date}
              </label>
              <input
                id="beo-event-date"
                type="date"
                value={eventDate}
                onChange={(e) => {
                  setEventDate(e.target.value)
                  setDateMismatch(null)
                }}
                className={inputClassName}
              />
              {dateMismatch && prefilledDate ? (
                <div
                  style={{
                    backgroundColor: '#FEF9C3',
                    border: '1px solid #FDE047',
                    borderRadius: '6px',
                    padding: '10px 12px',
                    marginTop: '6px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: '6px',
                    }}
                  >
                    <IconAlertTriangle
                      size={14}
                      stroke={2}
                      color="#854D0E"
                      style={{ flexShrink: 0, marginTop: '2px' }}
                    />
                    <p style={{ fontSize: '13px', color: '#854D0E', margin: 0 }}>
                      The date in your BEO (
                      {formatDateDisplay(dateMismatch.extractedDate)}) doesn&apos;t match
                      the date you selected ({formatDateDisplay(prefilledDate)}).
                    </p>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                    <button
                      type="button"
                      style={mismatchButtonStyle}
                      onClick={() => {
                        setEventDate(dateMismatch.extractedDate)
                        setDateMismatch(null)
                      }}
                    >
                      Use BEO date (
                      {formatDateDisplay(dateMismatch.extractedDate)})
                    </button>
                    <button
                      type="button"
                      style={mismatchButtonStyle}
                      onClick={() => {
                        setEventDate(prefilledDateValue)
                        setDateMismatch(null)
                      }}
                    >
                      Keep my selected date ({formatDateDisplay(prefilledDate)})
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            <div>
              <label htmlFor="beo-event-start-time" className="mb-1 block" style={labelStyle}>
                {labels.qe_event_start_time}
              </label>
              <input
                id="beo-event-start-time"
                type="time"
                value={eventStartTime}
                onChange={(e) => setEventStartTime(e.target.value)}
                className={inputClassName}
              />
            </div>

            <div>
              <label htmlFor="beo-venue" className="mb-1 block" style={labelStyle}>
                {labels.qe_venue}
              </label>
              <input
                id="beo-venue"
                type="text"
                value={venueName}
                onChange={(e) => setVenueName(e.target.value)}
                placeholder={labels.qe_venue_placeholder}
                className={inputClassName}
              />
            </div>

            <div>
              <label htmlFor="beo-guest-count" className="mb-1 block" style={labelStyle}>
                {labels.qe_guest_count}
              </label>
              <input
                id="beo-guest-count"
                type="number"
                min={0}
                value={guestCount}
                onChange={(e) => setGuestCount(e.target.value)}
                placeholder={labels.qe_guest_count_placeholder}
                className={inputClassName}
              />
            </div>

            <div>
              <label htmlFor="beo-event-type" className="mb-1 block" style={labelStyle}>
                {labels.qe_event_type}
              </label>
              <select
                id="beo-event-type"
                value={eventType}
                onChange={(e) => setEventType(e.target.value)}
                className={inputClassName}
              >
                <option value="">{labels.qe_select_event_type}</option>
                {event_types.map((type) => (
                  <option key={type.value} value={type.value}>
                    {type.label}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor="beo-service-style" className="mb-1 block" style={labelStyle}>
                {labels.qe_service_style}
              </label>
              <select
                id="beo-service-style"
                value={serviceStyle}
                onChange={(e) => setServiceStyle(e.target.value)}
                className={inputClassName}
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
              <label htmlFor="beo-total-staff" className="mb-1 block" style={labelStyle}>
                {labels.qe_total_staff_needed}
              </label>
              <input
                id="beo-total-staff"
                type="number"
                min={0}
                value={totalStaffNeeded}
                onChange={(e) => setTotalStaffNeeded(e.target.value)}
                placeholder={labels.qe_total_staff_placeholder}
                className={inputClassName}
              />
            </div>

            <div>
              <label htmlFor="beo-notes" className="mb-1 block" style={labelStyle}>
                {labels.beo_notes}
              </label>
              <textarea
                id="beo-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={labels.beo_notes_placeholder}
                rows={3}
                className={inputClassName}
              />
            </div>
          </div>

          <div className="mt-6 flex flex-col gap-3">
            <button
              type="button"
              onClick={handleConfirm}
              className="w-full rounded-lg py-3 font-semibold text-white"
              style={{ backgroundColor: colors.brand_navy }}
            >
              {labels.beo_confirm_create}
            </button>
            <button
              type="button"
              onClick={handleStartOver}
              className="w-full text-sm hover:underline"
              style={{ color: colors.text_muted }}
            >
              {labels.beo_start_over}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div
      className="flex min-h-screen flex-col px-4 py-6"
      style={{ backgroundColor: colors.brand_light_blue }}
    >
      {cancelButton}

      <div className="mx-auto w-full max-w-[480px] flex-1">
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_FILE_TYPES}
          className="hidden"
          onChange={(e) => handleFileSelection(e.target.files)}
        />

        <div
          role="button"
          tabIndex={0}
          onClick={() => fileInputRef.current?.click()}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              fileInputRef.current?.click()
            }
          }}
          onDragOver={(e) => {
            e.preventDefault()
            setIsDragOver(true)
          }}
          onDragLeave={(e) => {
            e.preventDefault()
            setIsDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setIsDragOver(false)
            handleFileSelection(e.dataTransfer.files)
          }}
          className="flex cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed text-center transition-colors"
          style={{
            height: '200px',
            borderColor: isDragOver ? colors.brand_navy : colors.brand_mid_blue,
            backgroundColor: isDragOver ? colors.surface_hover : colors.white,
          }}
        >
          <IconFileUpload size={48} color={colors.brand_navy} stroke={1.5} />
          <p
            className="mt-4"
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: colors.brand_navy,
            }}
          >
            {labels.beo_drop_zone_primary}
          </p>
          <p
            className="mt-1 px-4"
            style={{ fontSize: '14px', color: colors.text_muted }}
          >
            {labels.beo_drop_zone_secondary}
          </p>
        </div>

        <div className="my-6 flex items-center gap-4">
          <div className="h-px flex-1 bg-gray-300" />
          <span style={{ fontSize: '13px', color: colors.text_muted }}>
            {labels.beo_or_divider}
          </span>
          <div className="h-px flex-1 bg-gray-300" />
        </div>

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="w-full rounded-lg border-2 py-3 text-sm font-semibold"
          style={{
            borderColor: colors.brand_navy,
            color: colors.brand_navy,
            backgroundColor: colors.white,
          }}
        >
          {labels.beo_browse_files}
        </button>
      </div>
    </div>
  )
}
