import {
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { EventType } from '../../lib/productConfig'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { useOverlay } from '../../components/shared/AppShell'
import { supabase } from '../../lib/supabase'

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001'

interface EventTypeLegendSwatchProps {
  eventType: EventType
}

function EventTypeLegendSwatch({ eventType }: EventTypeLegendSwatchProps) {
  if (eventType.value === 'holiday_party') {
    return (
      <span
        className="inline-flex"
        style={{
          width: '10px',
          height: '14px',
          borderRadius: '2px',
          overflow: 'hidden',
          flexShrink: 0,
        }}
        aria-hidden="true"
      >
        <span style={{ width: '50%', backgroundColor: eventType.color }} />
        <span
          style={{
            width: '50%',
            backgroundColor: eventType.second_color ?? '#2E8B57',
          }}
        />
      </span>
    )
  }

  if (eventType.value === 'delivery') {
    return (
      <span
        className="inline-flex items-center"
        style={{ gap: '2px', flexShrink: 0 }}
        aria-hidden="true"
      >
        <span
          style={{
            width: '10px',
            height: '14px',
            borderRadius: '2px',
            backgroundColor: eventType.color,
            display: 'inline-block',
          }}
        />
        <span
          style={{
            width: '12px',
            height: '10px',
            borderRadius: '9999px',
            backgroundColor: eventType.color,
            color: '#FFFFFF',
            fontSize: '7px',
            fontWeight: 700,
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            lineHeight: 1,
          }}
        >
          D
        </span>
      </span>
    )
  }

  return (
    <span
      style={{
        width: '10px',
        height: '14px',
        borderRadius: '2px',
        display: 'inline-block',
        flexShrink: 0,
        backgroundColor: eventType.color,
      }}
      aria-hidden="true"
    />
  )
}

interface PillStyle {
  backgroundColor: string
  border: string
  color: string
}

function getPillStyle(status: string, isInactivePill: boolean): PillStyle {
  if (isInactivePill) {
    return {
      backgroundColor: '#000000',
      border: 'none',
      color: '#ffffff',
    }
  }

  if (status === 'staffed' || status === 'confirmed') {
    return {
      backgroundColor: 'rgba(220, 245, 231, 0.6)',
      border: 'none',
      color: '#166534',
    }
  }

  if (
    status === 'outreach_sent' ||
    status === 'round1_complete' ||
    status === 'round2_complete' ||
    status === 'in_progress' ||
    status === 'grid_built'
  ) {
    return {
      backgroundColor: 'rgba(254, 249, 195, 0.6)',
      border: 'none',
      color: '#854d0e',
    }
  }

  if (status === 'needs_attention') {
    return {
      backgroundColor: 'rgba(254, 226, 226, 0.6)',
      border: 'none',
      color: '#991b1b',
    }
  }

  return {
    backgroundColor: 'rgba(243, 244, 246, 0.6)',
    border: 'none',
    color: '#374151',
  }
}

interface CateringEvent {
  id: string
  organization_id: string
  event_name: string
  event_type: string
  event_date: string
  event_start_time: string | null
  guest_count: number | null
  status: string
  is_cancelled: boolean
  is_postponed: boolean
}

type CalendarView = 'month' | 'week'

function startOfDay(date: Date): Date {
  const next = new Date(date)
  next.setHours(0, 0, 0, 0)
  return next
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function isSameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  )
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function parseEventDate(eventDate: string): Date {
  return startOfDay(new Date(`${eventDate}T00:00:00`))
}

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const

function startOfWeek(date: Date): Date {
  const start = startOfDay(date)
  const daysSinceMonday = (start.getDay() + 6) % 7
  start.setDate(start.getDate() - daysSinceMonday)
  return start
}

function getMonthGridDays(activeDate: Date): Date[] {
  const firstOfMonth = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1)
  const gridStart = startOfWeek(firstOfMonth)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

function getTwoWeekDays(activeDate: Date): Date[] {
  const weekStart = startOfWeek(activeDate)
  return Array.from({ length: 14 }, (_, index) => addDays(weekStart, index))
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function formatEventTime(startTime: string | null): string {
  if (!startTime) {
    return ''
  }

  const [hours, minutes] = startTime.split(':').map(Number)
  if (Number.isNaN(hours) || Number.isNaN(minutes)) {
    return startTime
  }

  const date = new Date()
  date.setHours(hours, minutes, 0, 0)
  return date.toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  })
}

function isWithinNext30Days(eventDate: Date, today: Date): boolean {
  const end = addDays(today, 30)
  return eventDate >= today && eventDate <= end
}

function CalendarPage() {
  const { labels, navigation, event_types } = useProductConfig()

  const eventTypeColorMap = useMemo(
    () => new Map(event_types.map((type) => [type.value, type])),
    [event_types],
  )

  const [events, setEvents] = useState<CateringEvent[]>([])
  const [loading, setLoading] = useState(true)
  const [organizationEventCount, setOrganizationEventCount] = useState<
    number | null
  >(null)
  const [view, setView] = useState<CalendarView>('month')
  const [activeDate, setActiveDate] = useState(() => startOfDay(new Date()))
  const [showCancelled, setShowCancelled] = useState(false)

  const newEventLabel =
    navigation.blue.find((item) => item.id === 'new_event')?.label ?? ''

  useEffect(() => {
    async function fetchEvents() {
      setLoading(true)

      const { data, error } = await supabase
        .from('events')
        .select(
          'id, organization_id, event_name, event_type, event_date, status, is_cancelled, is_postponed, event_start_time, guest_count',
        )
        .eq('organization_id', ORGANIZATION_ID)

      if (!error && data) {
        setEvents(data as CateringEvent[])
      } else {
        setEvents([])
      }

      setLoading(false)
    }

    fetchEvents()
  }, [])

  useEffect(() => {
    async function fetchOrganizationEventCount() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        setOrganizationEventCount(0)
        return
      }

      const organizationId = user?.user_metadata?.organization_id
      if (typeof organizationId !== 'string' || !organizationId.trim()) {
        setOrganizationEventCount(0)
        return
      }

      const { count, error } = await supabase
        .from('events')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId.trim())

      setOrganizationEventCount(!error && count != null ? count : 0)
    }

    fetchOrganizationEventCount()
  }, [])

  const today = useMemo(() => startOfDay(new Date()), [])

  const activeEvents = useMemo(
    () => events.filter((event) => showCancelled || !event.is_cancelled),
    [events, showCancelled],
  )

  const stats = useMemo(() => {
    const upcoming = events.filter((event) => {
      if (event.is_cancelled) {
        return false
      }
      return isWithinNext30Days(parseEventDate(event.event_date), today)
    })

    return {
      upcoming: upcoming.length,
      needsAttention: upcoming.filter((event) => event.status === 'draft')
        .length,
      fullyStaffed: upcoming.filter((event) => event.status === 'confirmed')
        .length,
    }
  }, [events, today])

  const calendarDays =
    view === 'month' ? getMonthGridDays(activeDate) : getTwoWeekDays(activeDate)

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CateringEvent[]>()

    activeEvents.forEach((event) => {
      const key = event.event_date
      const existing = map.get(key) ?? []
      existing.push(event)
      map.set(key, existing)
    })

    return map
  }, [activeEvents])

  const handlePrevious = () => {
    setActiveDate((current) => {
      const next = new Date(current)
      if (view === 'month') {
        next.setMonth(next.getMonth() - 1)
      } else {
        next.setDate(next.getDate() - 7)
      }
      return startOfDay(next)
    })
  }

  const handleNext = () => {
    setActiveDate((current) => {
      const next = new Date(current)
      if (view === 'month') {
        next.setMonth(next.getMonth() + 1)
      } else {
        next.setDate(next.getDate() + 7)
      }
      return startOfDay(next)
    })
  }

  const handleToday = () => {
    setActiveDate(startOfDay(new Date()))
  }

  const { openOverlay } = useOverlay()

  const handleNewEvent = () => {
    openOverlay('new-event')
  }

  const handleEventClick = (eventId: string) => {
    window.open(`/event/${eventId}`, '_blank')
  }

  if (loading) {
    return (
      <div className="flex min-h-[calc(100vh-3rem)] flex-1 items-center justify-center bg-brand-light-blue">
        <div
          className="size-10 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
          role="status"
          aria-label="Loading"
        />
      </div>
    )
  }

  return (
    <div className="flex min-h-[calc(100vh-3rem)] flex-1 flex-col">
      <section className="max-h-[10vh] bg-brand-light-blue px-4 py-2">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
          <div className="flex items-center justify-center gap-2 rounded-lg border border-status-neutral bg-white px-4 py-2">
            <span className="text-2xl font-bold text-brand-navy">
              {stats.upcoming}
            </span>
            <span className="text-sm text-gray-500">{labels.upcoming_events}</span>
          </div>
          <div className="flex items-center justify-center gap-2 rounded-lg border border-status-neutral bg-white px-4 py-2">
            <span className="text-2xl font-bold text-brand-navy">
              {stats.needsAttention}
            </span>
            <span className="text-sm text-gray-500">{labels.needs_attention}</span>
          </div>
          <div className="flex items-center justify-center gap-2 rounded-lg border border-status-neutral bg-white px-4 py-2">
            <span className="text-2xl font-bold text-brand-navy">
              {stats.fullyStaffed}
            </span>
            <span className="text-sm text-gray-500">{labels.fully_staffed}</span>
          </div>
        </div>
      </section>

      <section className="flex flex-1 flex-col bg-white p-4">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-sm text-text-body hover:bg-gray-50"
              aria-label={labels.previous_period}
              onClick={handlePrevious}
            >
              ←
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-2 py-1 text-sm text-text-body hover:bg-gray-50"
              aria-label={labels.next_period}
              onClick={handleNext}
            >
              →
            </button>
            <button
              type="button"
              className="rounded border border-gray-300 px-3 py-1 text-sm text-text-body hover:bg-gray-50"
              onClick={handleToday}
            >
              {labels.today}
            </button>
          </div>

          <h2 className="text-2xl font-bold text-brand-navy">
            {view === 'month'
              ? formatMonthLabel(activeDate)
              : labels.this_week_and_next}
          </h2>

          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm text-text-body">
              <input
                type="checkbox"
                checked={showCancelled}
                onChange={(event) => setShowCancelled(event.target.checked)}
                className="rounded border-gray-300"
              />
              {labels.show_cancelled}
            </label>

            <div className="flex overflow-hidden rounded border border-gray-300">
              <button
                type="button"
                className={`px-3 py-1 text-sm ${
                  view === 'month'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-500'
                }`}
                onClick={() => setView('month')}
              >
                {labels.month_view}
              </button>
              <button
                type="button"
                className={`px-3 py-1 text-sm ${
                  view === 'week'
                    ? 'bg-brand-navy text-white'
                    : 'bg-white text-gray-500'
                }`}
                onClick={() => setView('week')}
              >
                {labels.week_view}
              </button>
            </div>

            <button
              type="button"
              className="rounded bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90"
              onClick={handleNewEvent}
            >
              {newEventLabel}
            </button>
          </div>
        </div>

        <div className="relative border border-gray-200 bg-gray-200">
          <div className="grid grid-cols-7 gap-px bg-gray-200">
          {WEEKDAY_LABELS.map((day) => (
            <div
              key={day}
              className="bg-gray-50 px-2 py-2 text-center text-base font-bold tracking-wide text-brand-red"
            >
              {day}
            </div>
          ))}

          {calendarDays.map((day) => {
            const dayKey = formatDateKey(day)
            const dayEvents = eventsByDay.get(dayKey) ?? []
            const inCurrentMonth =
              view === 'week' || day.getMonth() === activeDate.getMonth()

            return (
              <div
                key={dayKey}
                className={`min-h-28 bg-white p-1 ${
                  view === 'month' && !inCurrentMonth ? 'bg-gray-50' : ''
                } ${isSameDay(day, today) ? 'ring-2 ring-brand-red ring-inset' : ''}`}
              >
                <p
                  className={`mb-1 text-sm font-medium ${
                    inCurrentMonth ? 'text-brand-mid-blue' : 'text-gray-400'
                  }`}
                >
                  {day.getDate()}
                </p>

                <div className="flex flex-col gap-1">
                  {dayEvents.map((event) => {
                    const isCancelled = event.is_cancelled
                    const isPostponed = event.is_postponed && !isCancelled
                    const isInactivePill = isCancelled || isPostponed
                    const eventTypeConfig = eventTypeColorMap.get(event.event_type)
                    const barColor = eventTypeConfig?.color ?? '#9CA3AF'
                    const pillStyle = getPillStyle(event.status, isInactivePill)
                    const formattedStartTime = formatEventTime(
                      event.event_start_time,
                    )
                    const guestLabel =
                      event.guest_count != null
                        ? `${event.guest_count} guests`
                        : ''
                    const row2Parts = [formattedStartTime, guestLabel].filter(
                      Boolean,
                    )
                    const row2Text = row2Parts.join(' · ')

                    return (
                      <button
                        key={event.id}
                        type="button"
                        className="mb-0.5 flex min-h-[26px] w-full cursor-pointer flex-row overflow-hidden"
                        style={{
                          backgroundColor: pillStyle.backgroundColor,
                          border: pillStyle.border,
                          borderRadius: '6px',
                        }}
                        onClick={() => handleEventClick(event.id)}
                      >
                        {!isInactivePill ? (
                          event.event_type === 'holiday_party' ? (
                            <div
                              className="flex self-stretch"
                              style={{
                                width: '8px',
                                flexShrink: 0,
                              }}
                              aria-hidden="true"
                            >
                              <div
                                style={{
                                  width: '50%',
                                  backgroundColor:
                                    eventTypeConfig?.color ?? '#C0392B',
                                }}
                              />
                              <div
                                style={{
                                  width: '50%',
                                  backgroundColor:
                                    eventTypeConfig?.second_color ?? '#2E8B57',
                                }}
                              />
                            </div>
                          ) : (
                            <div
                              className="self-stretch"
                              style={{
                                width: '8px',
                                flexShrink: 0,
                                backgroundColor: barColor,
                              }}
                              aria-hidden="true"
                            />
                          )
                        ) : null}
                        <div
                          className="flex flex-1 flex-col justify-center"
                          style={{ padding: '2px 4px', gap: '1px' }}
                        >
                          <span
                            className="truncate text-left"
                            style={{
                              color: pillStyle.color,
                              fontSize: '10px',
                              fontWeight: 500,
                              lineHeight: 1.2,
                            }}
                          >
                            {event.event_name}
                          </span>
                          {!isInactivePill && row2Text ? (
                            <span
                              className="truncate text-left"
                              style={{
                                color: pillStyle.color,
                                fontSize: '9px',
                                lineHeight: 1.2,
                                opacity: 0.75,
                              }}
                            >
                              {row2Text}
                            </span>
                          ) : null}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
          </div>

          {!loading && organizationEventCount === 0 ? (
            <div
              className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-center px-4 text-center"
              style={{ top: '36px', pointerEvents: 'none' }}
            >
              <p
                style={{
                  fontSize: '15px',
                  fontWeight: 500,
                  color: '#111827',
                  pointerEvents: 'auto',
                }}
              >
                {labels.es_calendar_no_events_headline}
              </p>
              <p
                style={{
                  fontSize: '12px',
                  color: '#9ca3af',
                  marginTop: '8px',
                  maxWidth: '420px',
                  pointerEvents: 'auto',
                }}
              >
                {labels.es_calendar_no_events_secondary}
              </p>
              <button
                type="button"
                className="rounded bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90"
                style={{ marginTop: '16px', pointerEvents: 'auto' }}
                onClick={handleNewEvent}
              >
                {labels.es_calendar_new_event_cta}
              </button>
            </div>
          ) : null}
        </div>

        <div
          className="mt-1 flex flex-wrap items-center gap-2"
          style={{
            padding: '7px 12px',
            borderTop: '0.5px solid #e5e7eb',
          }}
        >
          <span
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: '#6b7280',
              letterSpacing: '0.05em',
              marginRight: '6px',
              alignSelf: 'center',
            }}
          >
            EVENT TYPE
          </span>
          {event_types.map((item) => (
            <span
              key={item.value}
              className="inline-flex items-center"
              style={{ gap: '4px', fontSize: '10px', color: '#6b7280' }}
            >
              <EventTypeLegendSwatch eventType={item} />
              {item.label}
            </span>
          ))}

          <span
            className="self-stretch"
            style={{
              width: '0.5px',
              backgroundColor: '#e5e7eb',
              margin: '0 4px',
            }}
            aria-hidden="true"
          />

          <span
            style={{
              fontSize: '9px',
              fontWeight: 600,
              color: '#6b7280',
              letterSpacing: '0.05em',
              marginRight: '6px',
              alignSelf: 'center',
            }}
          >
            STATUS
          </span>
          {[
            { label: 'Staffed', color: '#dcf5e7' },
            { label: 'In progress', color: '#fef9c3' },
            { label: 'Action needed', color: '#fee2e2' },
          ].map((item) => (
            <span
              key={item.label}
              className="inline-flex items-center"
              style={{ gap: '4px', fontSize: '10px', color: '#6b7280' }}
            >
              <span
                className="inline-block shrink-0"
                style={{
                  width: '12px',
                  height: '9px',
                  borderRadius: '2px',
                  backgroundColor: item.color,
                }}
                aria-hidden="true"
              />
              {item.label}
            </span>
          ))}

          <span
            className="inline-flex items-center"
            style={{ gap: '4px', fontSize: '10px', color: '#6b7280' }}
          >
            <span
              className="inline-flex shrink-0 items-center justify-center text-white"
              style={{
                backgroundColor: '#1B3A5C',
                fontSize: '7px',
                padding: '1px 3px',
                borderRadius: '2px',
              }}
            >
              HOLD
            </span>
            Soft hold
          </span>

          <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '10px', color: '#6b7280' }}>
            <span style={{ color: '#C0392B', fontSize: '11px' }}>⚠</span>
            <span>Competing event</span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default CalendarPage
