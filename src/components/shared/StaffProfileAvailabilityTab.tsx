import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  IconCalendarOff,
  IconCheck,
  IconClock,
} from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

const DAY_NAMES = [
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
  'Sunday',
] as const

const BASIC_AVAILABILITY_OPTIONS = [
  { value: 'weekdays', label: 'Weekdays only' },
  { value: 'weekends', label: 'Weekends only' },
  { value: 'both', label: 'Weekdays & Weekends' },
  { value: 'varies', label: 'Varies' },
] as const

type BasicAvailabilityValue =
  (typeof BASIC_AVAILABILITY_OPTIONS)[number]['value']

type WeeklyStatus = 'available_all_day' | 'not_available' | 'available_after'

interface WeeklyDayState {
  dayOfWeek: number
  recordId: string | null
  status: WeeklyStatus
  availableAfterTime: string
  confirmedByStaff: boolean
  confirmedAt: string | null
  disputed: boolean
}

interface BlackoutRecord {
  id: string
  vacationStart: string
  vacationEnd: string | null
  blackoutStartTime: string | null
}

interface MonthWindow {
  key: string
  label: string
  year: number
  month: number
}

export interface StaffProfileAvailabilityStaff {
  phone: string
  basic_availability: string | null
}

interface StaffProfileAvailabilityTabProps {
  staff: StaffProfileAvailabilityStaff
  organizationId: string | null
  onBasicAvailabilityChange: (value: BasicAvailabilityValue) => void
}

function SectionHeading({ children }: { children: string }) {
  const { colors } = useProductConfig()

  return (
    <h3
      style={{
        fontSize: '13px',
        fontWeight: 600,
        color: colors.brand_navy,
      }}
    >
      {children}
    </h3>
  )
}

function StatusBadge({
  label,
  tone,
}: {
  label: string
  tone: 'red' | 'amber' | 'green'
}) {
  const styles = {
    red: { color: '#991B1B', backgroundColor: '#FEE2E2' },
    amber: { color: '#92400E', backgroundColor: '#FEF3C7' },
    green: { color: '#166534', backgroundColor: '#DCFCE7' },
  }[tone]

  return (
    <span
      style={{
        fontSize: '10px',
        fontWeight: 600,
        borderRadius: '4px',
        padding: '2px 6px',
        whiteSpace: 'nowrap',
        ...styles,
      }}
    >
      {label}
    </span>
  )
}

function SectionSkeleton() {
  return (
    <div className="flex flex-col animate-pulse" style={{ gap: '8px' }}>
      {[0, 1, 2, 3].map((index) => (
        <div
          key={index}
          style={{
            height: '40px',
            backgroundColor: '#F3F4F6',
            borderRadius: '6px',
          }}
        />
      ))}
    </div>
  )
}

function parseTimeToInputValue(timeValue: string | null): string {
  if (!timeValue) {
    return ''
  }

  const match = timeValue.match(/(\d{2}):(\d{2})/)
  return match ? `${match[1]}:${match[2]}` : ''
}

function formatTime12Hour(timeValue: string | null): string {
  if (!timeValue) {
    return ''
  }

  const match = timeValue.match(/(\d{2}):(\d{2})/)
  if (!match) {
    return timeValue
  }

  let hours = Number.parseInt(match[1], 10)
  const minutes = match[2]
  const period = hours >= 12 ? 'PM' : 'AM'
  hours = hours % 12
  if (hours === 0) {
    hours = 12
  }

  return `${hours}:${minutes} ${period}`
}

function inputValueToTimetz(value: string): string | null {
  if (!value.trim()) {
    return null
  }

  return `${value}:00`
}

function formatShortDate(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function formatConfirmedDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
  })
}

function createDefaultWeeklyDays(): WeeklyDayState[] {
  return DAY_NAMES.map((_, dayOfWeek) => ({
    dayOfWeek,
    recordId: null,
    status: 'available_all_day',
    availableAfterTime: '',
    confirmedByStaff: false,
    confirmedAt: null,
    disputed: false,
  }))
}

function getMonthWindows(): MonthWindow[] {
  const windows: MonthWindow[] = []
  const start = new Date()
  start.setDate(1)
  start.setHours(12, 0, 0, 0)

  for (let index = 0; index < 12; index += 1) {
    const date = new Date(start.getFullYear(), start.getMonth() + index, 1)
    const year = date.getFullYear()
    const month = date.getMonth()
    windows.push({
      key: `${year}-${String(month + 1).padStart(2, '0')}`,
      label: date.toLocaleDateString('en-US', {
        month: 'long',
        year: 'numeric',
      }),
      year,
      month,
    })
  }

  return windows
}

function dateInMonth(isoDate: string, year: number, month: number): boolean {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`)
  return date.getFullYear() === year && date.getMonth() === month
}

function formatBlackoutRange(
  vacationStart: string,
  vacationEnd: string | null,
): string {
  const startLabel = formatShortDate(vacationStart)
  if (!vacationEnd || vacationEnd.slice(0, 10) === vacationStart.slice(0, 10)) {
    return startLabel
  }

  return `${startLabel} – ${formatShortDate(vacationEnd)}`
}

async function getCoordinatorPhone(): Promise<string> {
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (typeof user?.phone === 'string' && user.phone.trim()) {
    return user.phone.trim()
  }

  if (typeof user?.id === 'string' && user.id.trim()) {
    return user.id.trim()
  }

  return 'coordinator'
}

function normalizeBasicAvailability(
  value: string | null | undefined,
): BasicAvailabilityValue {
  if (
    value === 'weekdays' ||
    value === 'weekends' ||
    value === 'both' ||
    value === 'varies'
  ) {
    return value
  }

  return 'varies'
}

export default function StaffProfileAvailabilityTab({
  staff,
  organizationId,
  onBasicAvailabilityChange,
}: StaffProfileAvailabilityTabProps) {
  const { colors } = useProductConfig()
  const [basicAvailability, setBasicAvailability] = useState<BasicAvailabilityValue>(
    normalizeBasicAvailability(staff.basic_availability),
  )
  const [basicSavedVisible, setBasicSavedVisible] = useState(false)
  const [requestToastVisible, setRequestToastVisible] = useState(false)
  const [weeklyDays, setWeeklyDays] = useState<WeeklyDayState[]>(
    createDefaultWeeklyDays,
  )
  const [blackouts, setBlackouts] = useState<BlackoutRecord[]>([])
  const [weeklyLoading, setWeeklyLoading] = useState(true)
  const [blackoutsLoading, setBlackoutsLoading] = useState(true)
  const [weeklyError, setWeeklyError] = useState<string | null>(null)
  const [blackoutsError, setBlackoutsError] = useState<string | null>(null)
  const [savedDayKey, setSavedDayKey] = useState<number | null>(null)
  const [smsQueuedVisible, setSmsQueuedVisible] = useState(false)
  const [openAddFormMonthKey, setOpenAddFormMonthKey] = useState<string | null>(
    null,
  )
  const [addFormStartDate, setAddFormStartDate] = useState('')
  const [addFormEndDate, setAddFormEndDate] = useState('')
  const [addFormAfterTime, setAddFormAfterTime] = useState('')
  const [isSavingBlackout, setIsSavingBlackout] = useState(false)

  const monthWindows = useMemo(() => getMonthWindows(), [])

  useEffect(() => {
    setBasicAvailability(normalizeBasicAvailability(staff.basic_availability))
  }, [staff.basic_availability])

  const fieldLabelStyle = {
    fontSize: '13px',
    fontWeight: 500,
    color: colors.brand_navy,
  } as const

  const fieldInputStyle = {
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    padding: '6px 8px',
    fontSize: '12px',
    color: colors.text_body,
    backgroundColor: '#ffffff',
  } as const

  const outlineButtonStyle = {
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '6px',
    padding: '6px 12px',
    border: `1px solid ${colors.brand_navy}`,
    backgroundColor: 'transparent',
    color: colors.brand_navy,
    cursor: 'pointer',
    whiteSpace: 'nowrap' as const,
  }

  const solidButtonStyle = {
    ...outlineButtonStyle,
    backgroundColor: colors.brand_navy,
    color: colors.white,
    border: `1px solid ${colors.brand_navy}`,
  }

  const loadWeeklySchedule = useCallback(async () => {
    if (!organizationId) {
      setWeeklyDays(createDefaultWeeklyDays())
      setWeeklyLoading(false)
      return
    }

    setWeeklyLoading(true)
    setWeeklyError(null)

    const { data, error } = await supabase
      .from('staff_weekly_availability')
      .select(
        'id, day_of_week, status, available_after_time, confirmed_by_staff, confirmed_at',
      )
      .eq('organization_id', organizationId)
      .eq('staff_phone', staff.phone)

    if (error) {
      console.error('[StaffProfileAvailability] load weekly failed', error)
      setWeeklyError('Failed to load weekly schedule.')
      setWeeklyLoading(false)
      return
    }

    const byDay = new Map<number, (typeof data)[number]>()
    for (const row of data ?? []) {
      if (typeof row.day_of_week === 'number') {
        byDay.set(row.day_of_week, row)
      }
    }

    setWeeklyDays(
      createDefaultWeeklyDays().map((day) => {
        const row = byDay.get(day.dayOfWeek)
        if (!row) {
          return day
        }

        const status =
          row.status === 'not_available' || row.status === 'available_after'
            ? row.status
            : 'available_all_day'

        return {
          dayOfWeek: day.dayOfWeek,
          recordId: typeof row.id === 'string' ? row.id : null,
          status,
          availableAfterTime: parseTimeToInputValue(
            typeof row.available_after_time === 'string'
              ? row.available_after_time
              : null,
          ),
          confirmedByStaff: Boolean(row.confirmed_by_staff),
          confirmedAt:
            typeof row.confirmed_at === 'string' ? row.confirmed_at : null,
          disputed: false,
        }
      }),
    )
    setWeeklyLoading(false)
  }, [organizationId, staff.phone])

  const loadBlackouts = useCallback(async () => {
    if (!organizationId) {
      setBlackouts([])
      setBlackoutsLoading(false)
      return
    }

    setBlackoutsLoading(true)
    setBlackoutsError(null)

    const { data, error } = await supabase
      .from('staff_availability')
      .select('id, vacation_start, vacation_end, blackout_start_time')
      .eq('organization_id', organizationId)
      .eq('staff_phone', staff.phone)
      .eq('record_type', 'vacation_block')
      .order('vacation_start', { ascending: true })

    if (error) {
      console.error('[StaffProfileAvailability] load blackouts failed', error)
      setBlackoutsError('Failed to load blackout dates.')
      setBlackoutsLoading(false)
      return
    }

    setBlackouts(
      (data ?? [])
        .map((row) => {
          if (typeof row.id !== 'string' || typeof row.vacation_start !== 'string') {
            return null
          }

          return {
            id: row.id,
            vacationStart: row.vacation_start,
            vacationEnd:
              typeof row.vacation_end === 'string' ? row.vacation_end : null,
            blackoutStartTime:
              typeof row.blackout_start_time === 'string'
                ? row.blackout_start_time
                : null,
          }
        })
        .filter((row): row is BlackoutRecord => row !== null),
    )
    setBlackoutsLoading(false)
  }, [organizationId, staff.phone])

  useEffect(() => {
    void loadWeeklySchedule()
    void loadBlackouts()
  }, [loadBlackouts, loadWeeklySchedule])

  useEffect(() => {
    if (!basicSavedVisible) {
      return
    }

    const timer = window.setTimeout(() => {
      setBasicSavedVisible(false)
    }, 2000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [basicSavedVisible])

  useEffect(() => {
    if (savedDayKey === null) {
      return
    }

    const timer = window.setTimeout(() => {
      setSavedDayKey(null)
    }, 2000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [savedDayKey])

  useEffect(() => {
    if (!requestToastVisible) {
      return
    }

    const timer = window.setTimeout(() => {
      setRequestToastVisible(false)
    }, 3000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [requestToastVisible])

  useEffect(() => {
    if (!smsQueuedVisible) {
      return
    }

    const timer = window.setTimeout(() => {
      setSmsQueuedVisible(false)
    }, 3000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [smsQueuedVisible])

  const confirmedCount = weeklyDays.filter((day) => day.confirmedByStaff).length
  const disputedCount = weeklyDays.filter((day) => day.disputed).length

  const handleBasicAvailabilityChange = async (value: BasicAvailabilityValue) => {
    setBasicAvailability(value)

    if (!organizationId) {
      return
    }

    const { error } = await supabase
      .from('staff')
      .update({ basic_availability: value })
      .eq('organization_id', organizationId)
      .eq('phone', staff.phone)

    if (error) {
      console.error('[StaffProfileAvailability] save basic availability failed', error)
      return
    }

    onBasicAvailabilityChange(value)
    setBasicSavedVisible(true)
  }

  const persistWeeklyDay = async (day: WeeklyDayState) => {
    if (!organizationId) {
      return
    }

    const coordinatorPhone = await getCoordinatorPhone()
    const nowIso = new Date().toISOString()
    const payload = {
      staff_phone: staff.phone,
      organization_id: organizationId,
      day_of_week: day.dayOfWeek,
      status: day.status,
      available_after_time:
        day.status === 'available_after'
          ? inputValueToTimetz(day.availableAfterTime)
          : null,
      last_updated_by: coordinatorPhone,
      last_updated_at: nowIso,
    }

    if (day.recordId) {
      const { error } = await supabase
        .from('staff_weekly_availability')
        .update(payload)
        .eq('id', day.recordId)

      if (error) {
        console.error('[StaffProfileAvailability] update weekly day failed', error)
        return
      }

      setSavedDayKey(day.dayOfWeek)
      return
    }

    const { data, error } = await supabase
      .from('staff_weekly_availability')
      .insert({
        ...payload,
        confirmed_by_staff: false,
      })
      .select('id')
      .single()

    if (error) {
      console.error('[StaffProfileAvailability] insert weekly day failed', error)
      return
    }

    if (typeof data?.id === 'string') {
      setWeeklyDays((previous) =>
        previous.map((entry) =>
          entry.dayOfWeek === day.dayOfWeek
            ? { ...entry, recordId: data.id as string }
            : entry,
        ),
      )
    }

    setSavedDayKey(day.dayOfWeek)
  }

  const updateWeeklyDay = (
    dayOfWeek: number,
    patch: Partial<Pick<WeeklyDayState, 'status' | 'availableAfterTime'>>,
  ) => {
    setWeeklyDays((previous) => {
      const next = previous.map((day) => {
        if (day.dayOfWeek !== dayOfWeek) {
          return day
        }

        return {
          ...day,
          ...patch,
        }
      })

      const updatedDay = next.find((day) => day.dayOfWeek === dayOfWeek)
      if (updatedDay) {
        void persistWeeklyDay(updatedDay)
      }

      return next
    })
  }

  const resetAddForm = () => {
    setAddFormStartDate('')
    setAddFormEndDate('')
    setAddFormAfterTime('')
    setOpenAddFormMonthKey(null)
  }

  const handleSaveBlackout = async (_monthKey: string) => {
    if (!organizationId || !addFormStartDate.trim()) {
      return
    }

    setIsSavingBlackout(true)

    const coordinatorPhone = await getCoordinatorPhone()
    const nowIso = new Date().toISOString()

    const { data, error } = await supabase
      .from('staff_availability')
      .insert({
        organization_id: organizationId,
        staff_phone: staff.phone,
        record_type: 'vacation_block',
        vacation_start: addFormStartDate,
        vacation_end: addFormEndDate.trim() || null,
        blackout_start_time: inputValueToTimetz(addFormAfterTime),
        confirmed_by_staff: false,
        last_updated_by: coordinatorPhone,
        last_updated_at: nowIso,
      })
      .select('id, vacation_start, vacation_end, blackout_start_time')
      .single()

    if (error) {
      console.error('[StaffProfileAvailability] insert blackout failed', error)
      setIsSavingBlackout(false)
      return
    }

    if (
      typeof data?.id === 'string' &&
      typeof data.vacation_start === 'string'
    ) {
      setBlackouts((previous) =>
        [...previous, {
          id: data.id as string,
          vacationStart: data.vacation_start as string,
          vacationEnd:
            typeof data.vacation_end === 'string' ? data.vacation_end : null,
          blackoutStartTime:
            typeof data.blackout_start_time === 'string'
              ? data.blackout_start_time
              : null,
        }].sort(
          (left, right) =>
            new Date(left.vacationStart).getTime() -
            new Date(right.vacationStart).getTime(),
        ),
      )
      setSmsQueuedVisible(true)
    }

    resetAddForm()
    setIsSavingBlackout(false)
  }

  const handleRemoveBlackout = async (blackoutId: string) => {
    const { error } = await supabase
      .from('staff_availability')
      .delete()
      .eq('id', blackoutId)

    if (error) {
      console.error('[StaffProfileAvailability] delete blackout failed', error)
      return
    }

    setBlackouts((previous) => previous.filter((row) => row.id !== blackoutId))
  }

  const renderConfirmationBadge = (day: WeeklyDayState) => {
    if (day.disputed) {
      return <StatusBadge label="Disputed" tone="red" />
    }

    if (day.confirmedByStaff) {
      const dateLabel = day.confirmedAt
        ? formatConfirmedDate(day.confirmedAt)
        : ''
      return (
        <StatusBadge
          label={dateLabel ? `Confirmed ${dateLabel}` : 'Confirmed'}
          tone="green"
        />
      )
    }

    return <StatusBadge label="Unconfirmed" tone="amber" />
  }

  const renderStatusPills = (day: WeeklyDayState) => {
    const options: { value: WeeklyStatus; label: string }[] = [
      { value: 'available_all_day', label: 'All day' },
      { value: 'not_available', label: 'Not available' },
      { value: 'available_after', label: 'After time' },
    ]

    return (
      <div className="flex flex-wrap items-center" style={{ gap: '6px' }}>
        {options.map((option) => {
          const isActive = day.status === option.value
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => updateWeeklyDay(day.dayOfWeek, { status: option.value })}
              style={{
                fontSize: '11px',
                fontWeight: 500,
                borderRadius: '9999px',
                padding: '4px 10px',
                border: `1px solid ${isActive ? colors.brand_navy : '#E5E7EB'}`,
                backgroundColor: isActive ? '#EEF3F8' : '#ffffff',
                color: isActive ? colors.brand_navy : '#6B7280',
                cursor: 'pointer',
              }}
            >
              {option.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ padding: '16px' }}
    >
      <section style={{ marginBottom: '24px' }}>
        <div
          className="flex flex-wrap items-center"
          style={{ gap: '12px' }}
        >
          <span style={fieldLabelStyle}>General Availability</span>
          <select
            value={basicAvailability}
            onChange={(event) =>
              void handleBasicAvailabilityChange(
                event.target.value as BasicAvailabilityValue,
              )
            }
            style={{
              ...fieldInputStyle,
              minWidth: '200px',
            }}
          >
            {BASIC_AVAILABILITY_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          {basicSavedVisible ? (
            <span style={{ fontSize: '12px', color: '#9CA3AF' }}>Saved</span>
          ) : null}
        </div>
      </section>

      <section style={{ marginBottom: '24px' }}>
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-3"
        >
          <SectionHeading>Weekly Schedule</SectionHeading>
          <button
            type="button"
            style={outlineButtonStyle}
            onClick={() => setRequestToastVisible(true)}
          >
            Request Availability Update
          </button>
        </div>

        {requestToastVisible ? (
          <p
            style={{
              fontSize: '12px',
              color: '#6B7280',
              marginBottom: '10px',
            }}
          >
            SMS queued — will send when messaging is live.
          </p>
        ) : null}

        {weeklyLoading ? (
          <SectionSkeleton />
        ) : weeklyError ? (
          <div style={{ fontSize: '12px', color: colors.brand_red }}>
            {weeklyError}{' '}
            <button
              type="button"
              onClick={() => void loadWeeklySchedule()}
              className="underline"
              style={{
                color: colors.brand_navy,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            <p
              style={{
                fontSize: '12px',
                color:
                  confirmedCount === 7
                    ? '#166534'
                    : '#6B7280',
                marginBottom: '12px',
              }}
            >
              {confirmedCount === 7 ? (
                <>All days confirmed ✓</>
              ) : (
                <>
                  {confirmedCount} of 7 days confirmed by staff
                  {disputedCount > 0 ? (
                    <span style={{ color: colors.brand_red }}>
                      {' '}
                      · {disputedCount} disputed
                    </span>
                  ) : null}
                </>
              )}
            </p>

            <div className="flex flex-col" style={{ gap: '10px' }}>
              {weeklyDays.map((day) => (
                <div
                  key={day.dayOfWeek}
                  className="flex flex-wrap items-center"
                  style={{ gap: '10px' }}
                >
                  <span
                    style={{
                      width: '88px',
                      fontSize: '13px',
                      fontWeight: 600,
                      color: colors.brand_navy,
                      flexShrink: 0,
                    }}
                  >
                    {DAY_NAMES[day.dayOfWeek]}
                  </span>

                  <div className="min-w-0 flex-1">{renderStatusPills(day)}</div>

                  {day.status === 'available_after' ? (
                    <div className="flex items-center" style={{ gap: '4px' }}>
                      <IconClock size={14} color="#6B7280" stroke={1.5} />
                      <input
                        type="time"
                        value={day.availableAfterTime}
                        onChange={(event) =>
                          updateWeeklyDay(day.dayOfWeek, {
                            availableAfterTime: event.target.value,
                          })
                        }
                        style={fieldInputStyle}
                      />
                    </div>
                  ) : null}

                  <div
                    className="flex items-center"
                    style={{ gap: '8px', marginLeft: 'auto' }}
                  >
                    {renderConfirmationBadge(day)}
                    {savedDayKey === day.dayOfWeek ? (
                      <span
                        className="inline-flex items-center"
                        style={{
                          fontSize: '11px',
                          color: '#166534',
                          gap: '2px',
                        }}
                      >
                        <IconCheck size={12} stroke={2} />
                        Saved
                      </span>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <div style={{ marginBottom: '4px' }}>
          <SectionHeading>Blackout Dates</SectionHeading>
        </div>
        <p style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '16px' }}>
          Dates this staff member cannot work.
        </p>

        {smsQueuedVisible ? (
          <p
            style={{
              fontSize: '12px',
              color: '#6B7280',
              marginBottom: '12px',
            }}
          >
            Confirmation SMS queued
          </p>
        ) : null}

        {blackoutsLoading ? (
          <SectionSkeleton />
        ) : blackoutsError ? (
          <div style={{ fontSize: '12px', color: colors.brand_red }}>
            {blackoutsError}{' '}
            <button
              type="button"
              onClick={() => void loadBlackouts()}
              className="underline"
              style={{
                color: colors.brand_navy,
                background: 'none',
                border: 'none',
                padding: 0,
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        ) : (
          <div className="flex flex-col" style={{ gap: '20px' }}>
            {monthWindows.map((month) => {
              const monthBlackouts = blackouts.filter((row) =>
                dateInMonth(row.vacationStart, month.year, month.month),
              )

              return (
                <div key={month.key}>
                  <p
                    style={{
                      fontSize: '12px',
                      fontWeight: 600,
                      color: colors.brand_navy,
                      marginBottom: '8px',
                    }}
                  >
                    {month.label}
                  </p>

                  {monthBlackouts.length > 0 ? (
                    <ul
                      className="flex flex-col"
                      style={{ gap: '6px', marginBottom: '8px' }}
                    >
                      {monthBlackouts.map((blackout) => (
                        <li
                          key={blackout.id}
                          className="flex items-center justify-between"
                          style={{ fontSize: '13px', color: colors.text_body }}
                        >
                          <span className="inline-flex items-center" style={{ gap: '6px' }}>
                            <IconCalendarOff
                              size={14}
                              color={colors.brand_navy}
                              stroke={1.5}
                            />
                            <span>
                              {formatBlackoutRange(
                                blackout.vacationStart,
                                blackout.vacationEnd,
                              )}
                              {blackout.blackoutStartTime ? (
                                <span style={{ color: '#6B7280' }}>
                                  {' '}
                                  after {formatTime12Hour(blackout.blackoutStartTime)}
                                </span>
                              ) : null}
                            </span>
                          </span>
                          <button
                            type="button"
                            onClick={() => void handleRemoveBlackout(blackout.id)}
                            aria-label="Remove blackout"
                            style={{
                              fontSize: '16px',
                              lineHeight: 1,
                              color: '#9CA3AF',
                              background: 'none',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '0 4px',
                            }}
                          >
                            ×
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : null}

                  <button
                    type="button"
                    onClick={() => {
                      setOpenAddFormMonthKey(month.key)
                      setAddFormStartDate('')
                      setAddFormEndDate('')
                      setAddFormAfterTime('')
                    }}
                    className="underline"
                    style={{
                      fontSize: '12px',
                      color: colors.brand_navy,
                      background: 'none',
                      border: 'none',
                      padding: 0,
                      cursor: 'pointer',
                    }}
                  >
                    ＋ Add dates
                  </button>

                  {openAddFormMonthKey === month.key ? (
                    <div
                      style={{
                        marginTop: '10px',
                        padding: '12px',
                        border: '1px solid #E5E7EB',
                        borderRadius: '8px',
                        backgroundColor: '#F9FAFB',
                      }}
                    >
                      <div
                        className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                        style={{ marginBottom: '10px' }}
                      >
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '12px',
                              color: '#6B7280',
                              marginBottom: '4px',
                            }}
                          >
                            Start date
                          </label>
                          <input
                            type="date"
                            value={addFormStartDate}
                            onChange={(event) =>
                              setAddFormStartDate(event.target.value)
                            }
                            style={fieldInputStyle}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '12px',
                              color: '#6B7280',
                              marginBottom: '4px',
                            }}
                          >
                            End date (optional)
                          </label>
                          <input
                            type="date"
                            value={addFormEndDate}
                            onChange={(event) =>
                              setAddFormEndDate(event.target.value)
                            }
                            style={fieldInputStyle}
                          />
                        </div>
                        <div>
                          <label
                            style={{
                              display: 'block',
                              fontSize: '12px',
                              color: '#6B7280',
                              marginBottom: '4px',
                            }}
                          >
                            Available after (optional)
                          </label>
                          <input
                            type="time"
                            value={addFormAfterTime}
                            onChange={(event) =>
                              setAddFormAfterTime(event.target.value)
                            }
                            style={fieldInputStyle}
                          />
                        </div>
                      </div>
                      <div className="flex items-center" style={{ gap: '12px' }}>
                        <button
                          type="button"
                          disabled={isSavingBlackout || !addFormStartDate.trim()}
                          onClick={() => void handleSaveBlackout(month.key)}
                          style={{
                            ...solidButtonStyle,
                            opacity:
                              isSavingBlackout || !addFormStartDate.trim()
                                ? 0.6
                                : 1,
                          }}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          onClick={resetAddForm}
                          className="underline"
                          style={{
                            fontSize: '12px',
                            color: '#6B7280',
                            background: 'none',
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                          }}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        )}
      </section>
    </div>
  )
}
