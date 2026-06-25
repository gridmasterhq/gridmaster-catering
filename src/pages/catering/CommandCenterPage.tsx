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
  name: string
  event_type: string
  event_date: string
  start_time: string | null
  staffing_status: 'green' | 'amber' | 'red'
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

function endOfWeek(date: Date): Date {
  return addDays(startOfWeek(date), 6)
}

function getMonthGridDays(activeDate: Date): Date[] {
  const firstOfMonth = new Date(activeDate.getFullYear(), activeDate.getMonth(), 1)
  const gridStart = startOfWeek(firstOfMonth)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

function getWeekDays(activeDate: Date): Date[] {
  const weekStart = startOfWeek(activeDate)
  return Array.from({ length: 7 }, (_, index) => addDays(weekStart, index))
}

function formatMonthLabel(date: Date): string {
  return date.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
}

function formatWeekLabel(date: Date): string {
  const weekStart = startOfWeek(date)
  const weekEnd = endOfWeek(date)
  const startLabel = weekStart.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
  const endLabel = weekEnd.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
  return `${startLabel} – ${endLabel}`
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
          'id, organization_id, name, event_type, event_date, start_time, staffing_status, is_cancelled, is_postponed',
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

  const eventTypeColors = useMemo(() => {
    const map = new Map<string, string>()
    event_types.forEach((type) => {
      map.set(type.value, type.color)
    })
    return map
  }, [event_types])

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
      needsAttention: upcoming.filter(
        (event) =>
          event.staffing_status === 'amber' || event.staffing_status === 'red',
      ).length,
      fullyStaffed: upcoming.filter(
        (event) => event.staffing_status === 'green',
      ).length,
    }
  }, [events, today])

  const calendarDays = view === 'month' ? getMonthGridDays(activeDate) : getWeekDays(activeDate)

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

  const getPillColor = (event: CateringEvent): string => {
    return eventTypeColors.get(event.event_type) ?? colors.brand_navy
  }

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
      <section className="bg-brand-light-blue px-4 py-4">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          <div className="rounded-lg bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-brand-navy">{stats.upcoming}</p>
            <p className="mt-1 text-sm text-gray-500">{labels.upcoming_events}</p>
          </div>
          <div className="rounded-lg bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-brand-navy">
              {stats.needsAttention}
            </p>
            <p className="mt-1 text-sm text-gray-500">{labels.needs_attention}</p>
          </div>
          <div className="rounded-lg bg-white p-4 text-center shadow-sm">
            <p className="text-3xl font-bold text-brand-navy">
              {stats.fullyStaffed}
            </p>
            <p className="mt-1 text-sm text-gray-500">{labels.fully_staffed}</p>
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

          <h2 className="text-lg font-semibold text-text-body">
            {view === 'month'
              ? formatMonthLabel(activeDate)
              : formatWeekLabel(activeDate)}
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
              className="bg-gray-50 px-2 py-2 text-center text-sm font-bold tracking-wide text-brand-red"
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
                  className={`mb-1 inline-flex size-6 items-center justify-center rounded text-xs font-medium ${
                    isSameDay(day, today)
                      ? 'bg-brand-navy text-white'
                      : inCurrentMonth
                        ? 'text-brand-mid-blue'
                        : 'text-gray-400'
                  }`}
                >
                  {day.getDate()}
                </p>

                <div className="flex flex-col gap-1">
                  {dayEvents.map((event) => {
                    const isCancelled = event.is_cancelled
                    const isPostponed = event.is_postponed && !isCancelled
                    const pillColor = getPillColor(event)
                    const pillStyle = isCancelled || isPostponed
                      ? undefined
                      : ({
                          '--event-pill-color': pillColor,
                        } as CSSProperties)

                    let pillText = event.name
                    if (isPostponed) {
                      pillText = `${event.name} · ${labels.postponed_hold}`
                    } else if (!isCancelled) {
                      const time = formatEventTime(event.start_time)
                      pillText = time ? `${event.name} · ${time}` : event.name
                    }

                    return (
                      <button
                        key={event.id}
                        type="button"
                        style={pillStyle}
                        className={`w-full truncate rounded px-1 py-0.5 text-left text-xs text-white ${
                          isCancelled || isPostponed
                            ? 'bg-black'
                            : 'bg-[var(--event-pill-color)]'
                        }`}
                        onClick={() => handleEventClick(event.id)}
                      >
                        {pillText}
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

export default CommandCenterPage
