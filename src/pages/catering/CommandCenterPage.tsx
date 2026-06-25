import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

const ORGANIZATION_ID = '00000000-0000-0000-0000-000000000001'

interface CateringEvent {
  id: string
  organization_id: string
  event_name: string
  event_type: string
  event_date: string
  call_time: string | null
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

function CommandCenterPage() {
  const { labels, colors, event_types, navigation } = useProductConfig()

  const [events, setEvents] = useState<CateringEvent[]>([])
  const [loading, setLoading] = useState(true)
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
          'id, organization_id, event_name, event_type, event_date, call_time, status, is_cancelled, is_postponed',
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

  const handleNewEvent = () => {
    console.log(`${newEventLabel} clicked`)
  }

  const handleEventClick = (eventId: string) => {
    console.log(eventId)
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

        <div className="grid grid-cols-7 gap-px border border-gray-200 bg-gray-200">
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
                    const eventTypeBarColors: Record<string, string> = {
                      wedding: '#C9A84C',
                      wedding_life: '#C9A84C',
                      corporate: '#1B3A5C',
                      social: '#6B4C9A',
                      gala: '#1A6B3C',
                      gala_fundraiser: '#1A6B3C',
                      simple: '#2A9D8F',
                      simple_delivery: '#2A9D8F',
                      custom: '#C85000',
                    }
                    const barColor =
                      eventTypeBarColors[event.event_type] ?? '#9CA3AF'
                    const statusBgClass = isInactivePill
                      ? 'bg-black'
                      : event.status === 'confirmed'
                        ? 'bg-green-50'
                        : event.status === 'in_progress'
                          ? 'bg-amber-50'
                          : event.status === 'needs_attention'
                            ? 'bg-red-50'
                            : 'bg-white'
                    const formattedCallTime = formatEventTime(event.call_time)

                    return (
                      <button
                        key={event.id}
                        type="button"
                        className={`relative mb-1 flex min-h-9 w-full cursor-pointer flex-row overflow-hidden rounded-md border border-gray-200 ${statusBgClass}`}
                        onClick={() => handleEventClick(event.id)}
                      >
                        {!isInactivePill ? (
                          <div
                            className="w-1.5 shrink-0 rounded-l-md bg-[var(--event-bar-color)]"
                            style={
                              {
                                '--event-bar-color': barColor,
                              } as CSSProperties
                            }
                            aria-hidden="true"
                          />
                        ) : null}
                        <div className="flex min-w-0 flex-1 flex-col px-1.5 py-0.5">
                          <span
                            className={`truncate text-xs font-semibold ${
                              isInactivePill ? 'text-white' : 'text-gray-800'
                            }`}
                          >
                            {event.event_name}
                          </span>
                          {!isInactivePill && formattedCallTime ? (
                            <span className="truncate text-xs text-gray-500">
                              {formattedCallTime}
                            </span>
                          ) : null}
                        </div>
                        {event.status === 'hold' && !isInactivePill ? (
                          <span className="absolute top-0.5 right-0.5 rounded-sm bg-brand-navy px-1 text-[9px] text-white">
                            HOLD
                          </span>
                        ) : null}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>

        <div className="mt-4 flex flex-col flex-wrap gap-y-2 px-2 text-xs text-gray-500">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium uppercase">Event Type</span>
            {event_types
              .filter((type) => type.value !== 'past_cancelled')
              .map((type) => {
                const eventTypeBarColors: Record<string, string> = {
                  wedding: '#C9A84C',
                  wedding_life: '#C9A84C',
                  corporate: '#1B3A5C',
                  social: '#6B4C9A',
                  gala: '#1A6B3C',
                  gala_fundraiser: '#1A6B3C',
                  simple: '#2A9D8F',
                  simple_delivery: '#2A9D8F',
                  custom: '#C85000',
                }
                const dotColor =
                  eventTypeBarColors[type.value] ?? colors.brand_navy

                return (
                  <span key={type.value} className="inline-flex items-center">
                    <span
                      className="mr-1 inline-block size-2.5 rounded-full bg-[var(--key-dot-color)]"
                      style={
                        { '--key-dot-color': dotColor } as CSSProperties
                      }
                      aria-hidden="true"
                    />
                    {type.label}
                  </span>
                )
              })}
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span className="font-medium uppercase">Status</span>
            <span className="inline-flex items-center">
              <span className="mr-1 inline-block size-2.5 rounded-sm border border-green-500 bg-green-50" />
              Fully Staffed
            </span>
            <span className="inline-flex items-center">
              <span className="mr-1 inline-block size-2.5 rounded-sm border border-amber-500 bg-amber-50" />
              In Progress
            </span>
            <span className="inline-flex items-center">
              <span className="mr-1 inline-block size-2.5 rounded-sm border border-red-500 bg-red-50" />
              Needs Attention
            </span>
            <span className="inline-flex items-center">
              <span className="mr-1 inline-block size-2.5 rounded-sm border border-gray-300 bg-white" />
              Draft
            </span>
            <span className="inline-flex items-center">
              <span className="mr-1 inline-block size-2.5 rounded-sm bg-black" />
              Cancelled/Postponed
            </span>
          </div>
        </div>
      </section>
    </div>
  )
}

export default CommandCenterPage
