import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import { IconPencil } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { formatCoordinatorStaffName } from '../../lib/staffDisplayName'
import { supabase } from '../../lib/supabase'

const STAFF_RATING_GOLD = '#C9A84C'
const STAR_EMPTY_COLOR = '#D1D5DB'

const ROLE_LABELS: Record<string, string> = {
  server: 'Server',
  bartender: 'Bartender',
  bar_back: 'Bar Back',
  food_runner: 'Food Runner',
  captain: 'Captain',
  cit: 'Captain In Training (CIT)',
  setup_crew: 'Setup Crew',
  breakdown_crew: 'Breakdown Crew',
  line_cook: 'Line Cook',
  prep_cook: 'Prep Cook',
  dishwasher: 'Dishwasher',
  kitchen_runner: 'Kitchen Runner',
  sous_chef: 'Sous Chef',
  lead_chef: 'Lead Chef',
  driver: 'Driver',
  ops_lead: 'Ops Lead',
  trainer: 'Trainer',
}

interface StaffRoleRow {
  role: string
  is_primary: boolean
}

export interface StaffProfileHistoryStaff {
  phone: string
  legal_name: string
  display_name: string | null
  created_at: string
  average_rating: number | null
  rating_count: number
  staff_roles: StaffRoleRow[] | null
}

interface StaffProfileHistoryTabProps {
  staff: StaffProfileHistoryStaff
  organizationId: string | null
}

interface MilestoneItem {
  id: string
  date: string
  label: string
}

interface RatingHistoryItem {
  id: string
  date: string
  eventName: string
  roleAtEvent: string
  stars: number
  raterName: string
  isDisputed: boolean
}

interface EventHistoryItem {
  id: string
  eventDate: string
  eventName: string
  roleWorked: string
  assignmentStatus: string
}

function normalizeRoleKey(roleName: string): string {
  return roleName.trim().toLowerCase().replace(/\s+/g, '_')
}

function formatRoleLabel(roleName: string): string {
  const key = normalizeRoleKey(roleName)
  if (ROLE_LABELS[key]) {
    return ROLE_LABELS[key]
  }

  return roleName
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function formatDisplayDate(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }

  return date.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function toDateInputValue(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate.slice(0, 10)
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function sortMilestones(items: MilestoneItem[]): MilestoneItem[] {
  return [...items].sort(
    (left, right) =>
      new Date(right.date).getTime() - new Date(left.date).getTime(),
  )
}

function formatMonthYear(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return isoDate
  }

  return date.toLocaleDateString('en-US', {
    month: 'long',
    year: 'numeric',
  })
}

function monthFilterValue(isoDate: string): string {
  const date = new Date(isoDate)
  if (Number.isNaN(date.getTime())) {
    return ''
  }

  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  return `${year}-${month}`
}

function formatAssignmentStatus(status: string): string {
  return status
    .split('_')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

function getPrimaryRoleLabel(staff: StaffProfileHistoryStaff): string {
  const roles = staff.staff_roles ?? []
  const primary = roles.find((row) => row.is_primary)
  const roleName = primary?.role ?? roles[0]?.role
  return roleName ? formatRoleLabel(roleName) : 'Staff'
}

function GoldStars({ count, size = 12 }: { count: number; size?: number }) {
  const filled = Math.min(Math.max(Math.round(count), 0), 4)

  return (
    <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>
      {[1, 2, 3, 4].map((star) => (
        <span
          key={star}
          style={{
            color: star <= filled ? STAFF_RATING_GOLD : STAR_EMPTY_COLOR,
          }}
        >
          ★
        </span>
      ))}
    </span>
  )
}

function SectionHeading({ children }: { children: string }) {
  const { colors } = useProductConfig()

  return (
    <h3
      style={{
        fontSize: '13px',
        fontWeight: 600,
        color: colors.brand_navy,
        marginBottom: '12px',
      }}
    >
      {children}
    </h3>
  )
}

function EmptyState({ message }: { message: string }) {
  const { colors } = useProductConfig()

  return (
    <p
      style={{
        fontSize: '13px',
        fontStyle: 'italic',
        color: colors.text_muted,
      }}
    >
      {message}
    </p>
  )
}

function StatPill({
  label,
  value,
}: {
  label: string
  value: ReactNode
}) {
  const { colors } = useProductConfig()

  return (
    <div
      className="min-w-0 flex-1"
      style={{
        backgroundColor: '#F3F4F6',
        borderRadius: '8px',
        padding: '10px 12px',
      }}
    >
      <p
        style={{
          fontSize: '11px',
          fontWeight: 500,
          color: colors.text_muted,
          marginBottom: '4px',
        }}
      >
        {label}
      </p>
      <div
        style={{
          fontSize: '15px',
          fontWeight: 600,
          color: colors.brand_navy,
        }}
      >
        {value}
      </div>
    </div>
  )
}

export default function StaffProfileHistoryTab({
  staff,
  organizationId,
}: StaffProfileHistoryTabProps) {
  const { colors } = useProductConfig()
  const [loading, setLoading] = useState(true)
  const [totalEventsAllTime, setTotalEventsAllTime] = useState(0)
  const [totalEventsYtd, setTotalEventsYtd] = useState(0)
  const [milestones, setMilestones] = useState<MilestoneItem[]>([])
  const [ratings, setRatings] = useState<RatingHistoryItem[]>([])
  const [events, setEvents] = useState<EventHistoryItem[]>([])
  const [visibleEventCount, setVisibleEventCount] = useState(10)
  const [monthFilter, setMonthFilter] = useState('all')
  const [hireDate, setHireDate] = useState(staff.created_at)
  const [isEditingHireDate, setIsEditingHireDate] = useState(false)
  const [draftHireDate, setDraftHireDate] = useState('')
  const [isSavingHireDate, setIsSavingHireDate] = useState(false)

  const loadHistory = useCallback(async () => {
    if (!organizationId) {
      setLoading(false)
      return
    }

    setLoading(true)

    const yearStart = `${new Date().getFullYear()}-01-01`
    const thirteenMonthsAgo = new Date()
    thirteenMonthsAgo.setMonth(thirteenMonthsAgo.getMonth() - 13)
    const thirteenMonthsStart = thirteenMonthsAgo.toISOString().slice(0, 10)

    const [
      staffHireDateResult,
      allTimeCountResult,
      ytdCountResult,
      staffRolesResult,
      courseCompletionsResult,
      ratingsResult,
      assignmentsResult,
    ] = await Promise.all([
      supabase
        .from('staff')
        .select('hire_date, created_at')
        .eq('organization_id', organizationId)
        .eq('phone', staff.phone)
        .maybeSingle(),
      supabase
        .from('event_staff_assignments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone)
        .eq('status', 'confirmed'),
      supabase
        .from('event_staff_assignments')
        .select('id, events!inner(event_date)', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone)
        .eq('status', 'confirmed')
        .gte('events.event_date', yearStart),
      supabase
        .from('staff_roles')
        .select('role_name, is_primary, created_at, updated_at')
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone),
      supabase
        .from('course_completions')
        .select('course_type, status, started_at, completed_at, failed_at')
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone),
      supabase
        .from('ratings')
        .select(
          'id, event_id, stars, role_at_event, is_disputed, created_at, rater_phone',
        )
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone)
        .order('created_at', { ascending: false })
        .limit(10),
      supabase
        .from('event_staff_assignments')
        .select(
          'id, status, grid_row_id, role, events!inner(id, event_name, event_date)',
        )
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone)
        .gte('events.event_date', thirteenMonthsStart),
    ])

    setTotalEventsAllTime(allTimeCountResult.count ?? 0)
    setTotalEventsYtd(ytdCountResult.count ?? 0)

    const resolvedHireDate =
      typeof staffHireDateResult.data?.hire_date === 'string'
        ? staffHireDateResult.data.hire_date
        : typeof staffHireDateResult.data?.created_at === 'string'
          ? staffHireDateResult.data.created_at
          : staff.created_at

    setHireDate(resolvedHireDate)
    setIsEditingHireDate(false)

    const nextMilestones: MilestoneItem[] = [
      {
        id: 'hire',
        date: resolvedHireDate,
        label: 'Hire Date',
      },
    ]

    for (const row of staffRolesResult.data ?? []) {
      const roleName =
        typeof row.role_name === 'string' ? row.role_name.trim() : ''
      const createdAt =
        typeof row.created_at === 'string' ? row.created_at : null
      const updatedAt =
        typeof row.updated_at === 'string' ? row.updated_at : null

      if (!roleName || !createdAt) {
        continue
      }

      nextMilestones.push({
        id: `role-added-${roleName}-${createdAt}`,
        date: createdAt,
        label: `Added as ${formatRoleLabel(roleName)}`,
      })

      if (row.is_primary) {
        const promotionDate = updatedAt ?? createdAt
        nextMilestones.push({
          id: `role-primary-${roleName}-${promotionDate}`,
          date: promotionDate,
          label: `Promoted to ${formatRoleLabel(roleName)} (Primary)`,
        })
      }
    }

    if (!courseCompletionsResult.error) {
      for (const row of courseCompletionsResult.data ?? []) {
        const courseType =
          typeof row.course_type === 'string'
            ? row.course_type.trim().toLowerCase()
            : ''
        const isCitCourse =
          courseType.includes('cit') || courseType === 'captain_in_training'

        if (!isCitCourse) {
          continue
        }

        const startedAt =
          typeof row.started_at === 'string' ? row.started_at : null
        const completedAt =
          typeof row.completed_at === 'string' ? row.completed_at : null
        const failedAt =
          typeof row.failed_at === 'string' ? row.failed_at : null
        const status =
          typeof row.status === 'string' ? row.status.trim().toLowerCase() : ''

        if (startedAt) {
          nextMilestones.push({
            id: `cit-start-${startedAt}`,
            date: startedAt,
            label: 'CIT training started',
          })
        }

        if (status === 'passed' && completedAt) {
          nextMilestones.push({
            id: `cit-pass-${completedAt}`,
            date: completedAt,
            label: 'CIT passed',
          })
        }

        if (status === 'failed' && (failedAt ?? completedAt)) {
          nextMilestones.push({
            id: `cit-fail-${failedAt ?? completedAt}`,
            date: failedAt ?? completedAt ?? '',
            label: 'CIT failed',
          })
        }
      }
    }

    setMilestones(sortMilestones(nextMilestones))

    const ratingRows = ratingsResult.data ?? []
    const ratingEventIds = [
      ...new Set(
        ratingRows
          .map((row) => row.event_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ]
    const raterPhones = [
      ...new Set(
        ratingRows
          .map((row) => row.rater_phone)
          .filter((phone): phone is string => typeof phone === 'string'),
      ),
    ]

    const [eventsByIdResult, ratersByPhoneResult] = await Promise.all([
      ratingEventIds.length > 0
        ? supabase
            .from('events')
            .select('id, event_name')
            .eq('organization_id', organizationId)
            .in('id', ratingEventIds)
        : Promise.resolve({ data: [], error: null }),
      raterPhones.length > 0
        ? supabase
            .from('staff')
            .select('phone, display_name, legal_name, preferred_name')
            .eq('organization_id', organizationId)
            .in('phone', raterPhones)
        : Promise.resolve({ data: [], error: null }),
    ])

    const eventNameById = new Map(
      (eventsByIdResult.data ?? []).map((row) => [
        row.id as string,
        typeof row.event_name === 'string' ? row.event_name : 'Event',
      ]),
    )

    const raterNameByPhone = new Map(
      (ratersByPhoneResult.data ?? []).map((row) => {
        const phone = row.phone as string
        const preferred =
          typeof row.preferred_name === 'string'
            ? row.preferred_name.trim()
            : ''
        const display =
          typeof row.display_name === 'string' ? row.display_name.trim() : ''
        const legal =
          typeof row.legal_name === 'string' ? row.legal_name.trim() : ''

        return [
          phone,
          preferred ||
            display ||
            formatCoordinatorStaffName(
              typeof row.display_name === 'string' ? row.display_name : null,
              legal || phone,
            ),
        ]
      }),
    )

    setRatings(
      ratingRows.map((row) => ({
        id: row.id as string,
        date:
          typeof row.created_at === 'string'
            ? row.created_at
            : new Date().toISOString(),
        eventName:
          typeof row.event_id === 'string'
            ? (eventNameById.get(row.event_id) ?? 'Event')
            : 'Event',
        roleAtEvent:
          typeof row.role_at_event === 'string'
            ? formatRoleLabel(row.role_at_event)
            : 'Staff',
        stars: typeof row.stars === 'number' ? row.stars : 0,
        raterName:
          typeof row.rater_phone === 'string'
            ? (raterNameByPhone.get(row.rater_phone) ?? row.rater_phone)
            : 'Unknown',
        isDisputed: Boolean(row.is_disputed),
      })),
    )

    let assignmentRows: Array<{
      id: string
      status?: string | null
      role?: string | null
      grid_row_id?: string | null
      events:
        | { event_name?: string | null; event_date?: string | null }
        | { event_name?: string | null; event_date?: string | null }[]
        | null
    }> = []

    if (assignmentsResult.error) {
      const { data: fallbackAssignments } = await supabase
        .from('event_staff_assignments')
        .select('id, status, role, events!inner(event_name, event_date)')
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone)
        .gte('events.event_date', thirteenMonthsStart)

      assignmentRows = (fallbackAssignments ?? []) as typeof assignmentRows
    } else {
      assignmentRows = (assignmentsResult.data ?? []) as typeof assignmentRows
    }

    assignmentRows.sort((left, right) => {
      const leftEvent = Array.isArray(left.events) ? left.events[0] : left.events
      const rightEvent = Array.isArray(right.events)
        ? right.events[0]
        : right.events
      const leftDate =
        leftEvent && typeof leftEvent.event_date === 'string'
          ? leftEvent.event_date
          : ''
      const rightDate =
        rightEvent && typeof rightEvent.event_date === 'string'
          ? rightEvent.event_date
          : ''

      return rightDate.localeCompare(leftDate)
    })
    const gridRowIds = [
      ...new Set(
        assignmentRows
          .map((row) => row.grid_row_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ]

    const gridRowsResult =
      gridRowIds.length > 0
        ? await supabase
            .from('event_grid_rows')
            .select('id, role')
            .eq('organization_id', organizationId)
            .in('id', gridRowIds)
        : { data: [], error: null }

    const roleByGridRowId = new Map(
      (gridRowsResult.data ?? []).map((row) => [
        row.id as string,
        typeof row.role === 'string' ? formatRoleLabel(row.role) : null,
      ]),
    )

    const primaryRoleLabel = getPrimaryRoleLabel(staff)

    setEvents(
      assignmentRows.map((row) => {
        const event = Array.isArray(row.events) ? row.events[0] : row.events
        const eventDate =
          event && typeof event.event_date === 'string'
            ? event.event_date
            : new Date().toISOString()
        const eventName =
          event && typeof event.event_name === 'string'
            ? event.event_name
            : 'Event'
        const gridRowId =
          typeof row.grid_row_id === 'string' ? row.grid_row_id : null
        const assignmentRole =
          typeof row.role === 'string' ? formatRoleLabel(row.role) : null

        return {
          id: row.id as string,
          eventDate,
          eventName,
          roleWorked:
            (gridRowId ? roleByGridRowId.get(gridRowId) : null) ??
            assignmentRole ??
            primaryRoleLabel,
          assignmentStatus:
            typeof row.status === 'string'
              ? formatAssignmentStatus(row.status)
              : 'Unknown',
        }
      }),
    )

    setVisibleEventCount(10)
    setMonthFilter('all')
    setLoading(false)
  }, [organizationId, staff])

  useEffect(() => {
    void loadHistory()
  }, [loadHistory])

  const handleStartHireDateEdit = () => {
    setDraftHireDate(toDateInputValue(hireDate))
    setIsEditingHireDate(true)
  }

  const handleCancelHireDateEdit = () => {
    setDraftHireDate(toDateInputValue(hireDate))
    setIsEditingHireDate(false)
  }

  const handleSaveHireDate = async () => {
    if (!organizationId || !draftHireDate) {
      return
    }

    setIsSavingHireDate(true)

    const { error } = await supabase
      .from('staff')
      .update({ hire_date: draftHireDate })
      .eq('organization_id', organizationId)
      .eq('phone', staff.phone)

    if (error) {
      console.error('[StaffProfileHistory] update hire_date failed', error)
      setIsSavingHireDate(false)
      return
    }

    const savedHireDate = new Date(`${draftHireDate}T12:00:00`).toISOString()
    setHireDate(savedHireDate)
    setMilestones((previous) =>
      sortMilestones(
        previous.map((milestone) =>
          milestone.id === 'hire'
            ? { ...milestone, date: savedHireDate, label: 'Hire Date' }
            : milestone,
        ),
      ),
    )
    setIsEditingHireDate(false)
    setIsSavingHireDate(false)
  }

  const monthFilterOptions = useMemo(() => {
    const months = new Map<string, string>()

    for (const event of events) {
      const value = monthFilterValue(event.eventDate)
      if (!value) {
        continue
      }

      months.set(value, formatMonthYear(event.eventDate))
    }

    return [
      { value: 'all', label: 'All months' },
      ...[...months.entries()]
        .sort(([left], [right]) => right.localeCompare(left))
        .map(([value, label]) => ({ value, label })),
    ]
  }, [events])

  const filteredEvents = useMemo(() => {
    if (monthFilter === 'all') {
      return events
    }

    return events.filter(
      (event) => monthFilterValue(event.eventDate) === monthFilter,
    )
  }, [events, monthFilter])

  const visibleEvents = filteredEvents.slice(0, visibleEventCount)
  const hasMoreEvents = visibleEventCount < filteredEvents.length

  const currentRatingDisplay =
    staff.rating_count >= 6 && staff.average_rating != null ? (
      <span className="inline-flex items-center gap-1">
        <span>{staff.average_rating.toFixed(1)}</span>
        <GoldStars count={staff.average_rating} size={13} />
      </span>
    ) : (
      <span style={{ fontStyle: 'italic', color: colors.text_muted }}>New</span>
    )

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <div
          className="size-8 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
          role="status"
          aria-label="Loading history"
        />
      </div>
    )
  }

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto"
      style={{ padding: '16px', backgroundColor: '#ffffff' }}
    >
      <div className="flex gap-2" style={{ marginBottom: '20px' }}>
        <StatPill
          label="Total Events (All Time)"
          value={totalEventsAllTime}
        />
        <StatPill label="Total Events (Year to Date)" value={totalEventsYtd} />
        <StatPill label="Current Rating" value={currentRatingDisplay} />
      </div>

      <section style={{ marginBottom: '24px' }}>
        <SectionHeading>Milestone Timeline</SectionHeading>
        {milestones.length === 0 ? (
          <EmptyState message="No milestones yet" />
        ) : (
          <div className="flex flex-col" style={{ gap: '12px' }}>
            {milestones.map((milestone) => (
              <div
                key={milestone.id}
                className="flex items-start gap-3"
                style={{ fontSize: '13px' }}
              >
                <div
                  className="mt-1 shrink-0 rounded-full"
                  style={{
                    width: '8px',
                    height: '8px',
                    backgroundColor: colors.brand_navy,
                  }}
                />
                <div className="flex min-w-0 flex-1 gap-3">
                  {milestone.id === 'hire' ? (
                    <div
                      className="flex shrink-0 items-center gap-1"
                      style={{ minWidth: '96px' }}
                    >
                      {isEditingHireDate ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <input
                            type="date"
                            value={draftHireDate}
                            onChange={(event) =>
                              setDraftHireDate(event.target.value)
                            }
                            disabled={isSavingHireDate}
                            style={{
                              fontSize: '12px',
                              color: colors.text_body,
                              border: '1px solid #E5E7EB',
                              borderRadius: '6px',
                              padding: '4px 6px',
                            }}
                          />
                          <button
                            type="button"
                            onClick={() => void handleSaveHireDate()}
                            disabled={isSavingHireDate || !draftHireDate}
                            className="border-none bg-transparent p-0 hover:opacity-80"
                            style={{
                              fontSize: '12px',
                              color: colors.brand_navy,
                              cursor: 'pointer',
                            }}
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={handleCancelHireDateEdit}
                            disabled={isSavingHireDate}
                            className="border-none bg-transparent p-0 hover:opacity-80"
                            style={{
                              fontSize: '12px',
                              color: colors.text_muted,
                              cursor: 'pointer',
                            }}
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <>
                          <span style={{ color: colors.text_muted }}>
                            {formatDisplayDate(hireDate)}
                          </span>
                          <button
                            type="button"
                            onClick={handleStartHireDateEdit}
                            className="rounded p-0.5 hover:opacity-80"
                            style={{
                              color: colors.brand_navy,
                              border: 'none',
                              background: 'none',
                              cursor: 'pointer',
                              lineHeight: 0,
                            }}
                            aria-label="Edit hire date"
                          >
                            <IconPencil size={14} stroke={2} />
                          </button>
                        </>
                      )}
                    </div>
                  ) : (
                    <span
                      className="shrink-0"
                      style={{ width: '96px', color: colors.text_muted }}
                    >
                      {formatDisplayDate(milestone.date)}
                    </span>
                  )}
                  <span style={{ color: colors.text_body }}>{milestone.label}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section style={{ marginBottom: '24px' }}>
        <SectionHeading>Rating History</SectionHeading>
        {ratings.length === 0 ? (
          <EmptyState message="No ratings yet" />
        ) : (
          <div className="flex flex-col" style={{ gap: '10px' }}>
            {ratings.map((rating) => (
              <div
                key={rating.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
                style={{
                  fontSize: '13px',
                  borderBottom: '1px solid #F3F4F6',
                  paddingBottom: '10px',
                }}
              >
                <span style={{ color: colors.text_muted, minWidth: '96px' }}>
                  {formatDisplayDate(rating.date)}
                </span>
                <span style={{ color: colors.text_body, fontWeight: 500 }}>
                  {rating.eventName}
                </span>
                <span style={{ color: colors.text_muted }}>{rating.roleAtEvent}</span>
                <GoldStars count={rating.stars} />
                <span style={{ color: colors.text_muted }}>{rating.raterName}</span>
                {rating.isDisputed ? (
                  <span
                    style={{
                      fontSize: '10px',
                      fontWeight: 600,
                      color: colors.brand_red,
                      backgroundColor: '#FEE2E2',
                      borderRadius: '4px',
                      padding: '2px 6px',
                    }}
                  >
                    Disputed
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <div
          className="mb-3 flex flex-wrap items-center justify-between gap-2"
        >
          <SectionHeading>Event History</SectionHeading>
          {events.length > 0 ? (
            <select
              value={monthFilter}
              onChange={(event) => {
                setMonthFilter(event.target.value)
                setVisibleEventCount(10)
              }}
              style={{
                fontSize: '12px',
                color: colors.text_body,
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                padding: '6px 8px',
                backgroundColor: '#ffffff',
              }}
            >
              {monthFilterOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          ) : null}
        </div>

        {filteredEvents.length === 0 ? (
          <EmptyState message="No events yet" />
        ) : (
          <>
            <div className="flex flex-col" style={{ gap: '10px' }}>
              {visibleEvents.map((event) => (
                <div
                  key={event.id}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1"
                  style={{
                    fontSize: '13px',
                    borderBottom: '1px solid #F3F4F6',
                    paddingBottom: '10px',
                  }}
                >
                  <span style={{ color: colors.text_muted, minWidth: '96px' }}>
                    {formatDisplayDate(event.eventDate)}
                  </span>
                  <span style={{ color: colors.text_body, fontWeight: 500 }}>
                    {event.eventName}
                  </span>
                  <span style={{ color: colors.text_muted }}>{event.roleWorked}</span>
                  <span style={{ color: colors.text_muted }}>
                    {event.assignmentStatus}
                  </span>
                </div>
              ))}
            </div>
            {hasMoreEvents ? (
              <button
                type="button"
                onClick={() => setVisibleEventCount((current) => current + 10)}
                className="mt-3 border-none bg-transparent p-0 hover:opacity-80"
                style={{
                  fontSize: '13px',
                  color: colors.brand_navy,
                  textDecoration: 'underline',
                  cursor: 'pointer',
                }}
              >
                Load More
              </button>
            ) : null}
          </>
        )}
      </section>
    </div>
  )
}
