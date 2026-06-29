import type { CSSProperties, ReactNode } from 'react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  IconActivity,
  IconCloud,
  IconHeartRateMonitor,
  IconMapPin,
  IconSearch,
  IconSpeakerphone,
  IconX,
  IconZzz,
} from '@tabler/icons-react'
import type { Icon } from '@tabler/icons-react'
import { useActiveScreen, useOverlay } from '../../components/shared/AppShell'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { formatDateForInput } from '../../lib/dateUtils'
import {
  openStaffProfileNavigation,
  parseStaffProfileDeepLink,
} from '../../lib/staffProfileNavigation'
import { supabase } from '../../lib/supabase'

const DRAFT_ACTION_REFRESH_MS = 5 * 60 * 1000
const STAFF_COMPLIANCE_CATEGORY = 'staff_compliance'

interface PersistedActionItemRow {
  id: string
  category: string
  entity_type: string
  entity_id: string
  title: string
  description: string | null
  priority: string
  deep_link: string
  auto_resolves: boolean
  status: string
}

interface DraftActionEvent {
  id: string
  event_name: string
  event_date: string
  created_at: string
  status: string
}

const DRAFT_EVENT_ITEM_TYPE = 'draft_event'

function getTwoDaysFromTodayDate(): string {
  const date = new Date()
  date.setDate(date.getDate() + 2)
  return formatDateForInput(date)
}

function isEventDateWithinTwoDays(eventDate: string): boolean {
  return eventDate <= getTwoDaysFromTodayDate()
}

function getHoursUntilEventStart(eventDate: string): number {
  const eventStart = new Date(`${eventDate}T00:00:00`)
  return Math.round((eventStart.getTime() - Date.now()) / (1000 * 60 * 60))
}

function getDraftActionSubtext(event: DraftActionEvent): string {
  if (isEventDateWithinTwoDays(event.event_date)) {
    const hours = getHoursUntilEventStart(event.event_date)
    if (hours > 0) {
      return `Event is in ${hours} hours — still a draft`
    }
    if (hours === 0) {
      return 'Event is today — still a draft'
    }
    const hoursAgo = Math.abs(hours)
    return `Event was ${hoursAgo} hours ago — still a draft`
  }

  const draftDays = Math.max(
    1,
    Math.floor(
      (Date.now() - new Date(event.created_at).getTime()) / (1000 * 60 * 60 * 24),
    ),
  )
  return `Draft for ${draftDays} days — needs review`
}

function formatActionItemEventDate(
  eventDate: string | null | undefined,
): string | null {
  if (!eventDate?.trim()) {
    return null
  }

  const parsed = new Date(`${eventDate.trim()}T12:00:00`)
  if (Number.isNaN(parsed.getTime())) {
    return null
  }

  return parsed
    .toLocaleDateString('en-US', {
      weekday: 'short',
      month: 'short',
      day: 'numeric',
    })
    .replace(', ', ' ')
}

function getDraftActionTitle(event: DraftActionEvent): string {
  const formattedDate = formatActionItemEventDate(event.event_date)
  return formattedDate
    ? `${event.event_name} (${formattedDate})`
    : event.event_name
}

function isSystemResolvableItemType(itemType: string): boolean {
  return itemType === DRAFT_EVENT_ITEM_TYPE
}

function isSnoozeFiltered(
  event: DraftActionEvent,
  snoozedEventIds: Set<string>,
): boolean {
  if (!snoozedEventIds.has(event.id)) {
    return false
  }

  if (
    isEventDateWithinTwoDays(event.event_date)
  ) {
    return false
  }

  return true
}

function getSnoozeWakeUpLabel(snoozeUntil: string): string {
  const msRemaining = new Date(snoozeUntil).getTime() - Date.now()
  const daysRemaining = Math.floor(msRemaining / (1000 * 60 * 60 * 24))

  if (daysRemaining <= 0) {
    return 'Wakes up today'
  }
  if (daysRemaining === 1) {
    return 'Wakes up tomorrow'
  }
  return `Wakes up in ${daysRemaining} days`
}

interface SnoozePopoverProps {
  anchorEl: HTMLElement
  onClose: () => void
  onSelect: (days: number) => void
  zIndex?: number
}

function SnoozePopover({
  anchorEl,
  onClose,
  onSelect,
  zIndex = 200,
}: SnoozePopoverProps) {
  const popoverRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!popoverRef.current) {
      return
    }

    const rect = anchorEl.getBoundingClientRect()
    const popoverEl = popoverRef.current
    popoverEl.style.top = `${rect.bottom + 4}px`
    popoverEl.style.left = `${rect.right}px`
    popoverEl.style.transform = 'translateX(-100%)'
  }, [anchorEl])

  useEffect(() => {
    function handleMouseDown(event: MouseEvent) {
      if (
        popoverRef.current?.contains(event.target as Node) ||
        anchorEl.contains(event.target as Node)
      ) {
        return
      }
      onClose()
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleMouseDown)
    document.addEventListener('keydown', handleKeyDown)

    return () => {
      document.removeEventListener('mousedown', handleMouseDown)
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [anchorEl, onClose])

  return createPortal(
    <div
      ref={popoverRef}
      style={{
        position: 'fixed',
        zIndex,
        display: 'flex',
        alignItems: 'center',
        backgroundColor: '#ffffff',
        border: '1px solid #E5E7EB',
        borderRadius: '6px',
        boxShadow: '0 2px 8px rgba(0,0,0,0.12)',
      }}
    >
      {[3, 7, 14].map((days) => (
        <button
          key={days}
          type="button"
          onClick={() => onSelect(days)}
          className="hover:bg-[#F3F4F6]"
          style={{
            fontSize: '12px',
            fontWeight: 500,
            color: '#1B3A5C',
            padding: '6px 12px',
            border: 'none',
            background: 'none',
            cursor: 'pointer',
          }}
        >
          {days} days
        </button>
      ))}
    </div>,
    document.body,
  )
}

interface SnoozedItemRow {
  id: string
  event_id: string | null
  item_type: string
  snooze_until: string
  events: {
    id: string
    event_name: string
    event_date: string
    created_at: string
    status: string
  }[] | null
}

interface ActionItemsSnoozedPanelProps {
  isOpen: boolean
  onClose: () => void
  onRestored: (eventId: string | null) => void
  onRestoreUndone: (eventId: string | null) => void
}

function ActionItemsSnoozedPanel({
  isOpen,
  onClose,
  onRestored,
  onRestoreUndone,
}: ActionItemsSnoozedPanelProps) {
  const [slideIn, setSlideIn] = useState(false)
  const [snoozedItems, setSnoozedItems] = useState<SnoozedItemRow[]>([])
  const [loading, setLoading] = useState(false)
  const [restoreErrors, setRestoreErrors] = useState<Record<string, string>>({})
  const [updateErrors, setUpdateErrors] = useState<Record<string, string>>({})
  const [panelSnoozePopover, setPanelSnoozePopover] = useState<{
    snoozeId: string
    anchorEl: HTMLElement
  } | null>(null)

  useEffect(() => {
    if (!isOpen) {
      setSlideIn(false)
      setPanelSnoozePopover(null)
      return
    }

    const frame = requestAnimationFrame(() => {
      setSlideIn(true)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) {
      return
    }

    let cancelled = false

    async function loadSnoozedItems() {
      setLoading(true)

      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (cancelled || userError) {
          if (userError) {
            console.error('[CommandCenter] snoozed panel: getUser failed', userError)
          }
          setSnoozedItems([])
          setLoading(false)
          return
        }

        const organizationId = user?.user_metadata?.organization_id
        if (typeof organizationId !== 'string' || !organizationId.trim()) {
          setSnoozedItems([])
          setLoading(false)
          return
        }

        const nowIso = new Date().toISOString()
        const { data, error } = await supabase
          .from('action_item_snoozes')
          .select(
            'id, event_id, item_type, snooze_until, events(id, event_name, event_date, created_at, status)',
          )
          .eq('organization_id', organizationId.trim())
          .gt('snooze_until', nowIso)
          .order('snooze_until', { ascending: true })

        if (cancelled) {
          return
        }

        if (error) {
          console.error('[CommandCenter] snoozed panel load failed', error)
          setSnoozedItems([])
        } else {
          setSnoozedItems(
            (data ?? []).map((row) => {
              const rawEvents = row.events as
                | SnoozedItemRow['events']
                | NonNullable<SnoozedItemRow['events']>[number]
                | null

              return {
                ...row,
                events:
                  rawEvents == null
                    ? null
                    : Array.isArray(rawEvents)
                      ? rawEvents
                      : [rawEvents],
              } as SnoozedItemRow
            }),
          )
        }
      } catch (error) {
        console.error('[CommandCenter] snoozed panel unexpected error', error)
        if (!cancelled) {
          setSnoozedItems([])
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadSnoozedItems()

    return () => {
      cancelled = true
    }
  }, [isOpen])

  const handleRestore = async (row: SnoozedItemRow) => {
    setRestoreErrors((previous) => {
      const next = { ...previous }
      delete next[row.id]
      return next
    })

    onRestored(row.event_id)
    setSnoozedItems((previous) => previous.filter((item) => item.id !== row.id))

    const { error } = await supabase
      .from('action_item_snoozes')
      .delete()
      .eq('id', row.id)

    if (error) {
      console.error('[CommandCenter] snooze restore failed', error)
      onRestoreUndone(row.event_id)
      setSnoozedItems((previous) => {
        const restored = [...previous, row]
        restored.sort(
          (a, b) =>
            new Date(a.snooze_until).getTime() - new Date(b.snooze_until).getTime(),
        )
        return restored
      })
      setRestoreErrors((previous) => ({
        ...previous,
        [row.id]: 'Restore failed — try again',
      }))
    }
  }

  const handleSnoozeLonger = async (row: SnoozedItemRow, days: number) => {
    setPanelSnoozePopover(null)
    setUpdateErrors((previous) => {
      const next = { ...previous }
      delete next[row.id]
      return next
    })

    const previousUntil = row.snooze_until
    const snoozeUntil = new Date()
    snoozeUntil.setDate(snoozeUntil.getDate() + days)
    const snoozeUntilIso = snoozeUntil.toISOString()

    setSnoozedItems((previous) =>
      previous.map((item) =>
        item.id === row.id ? { ...item, snooze_until: snoozeUntilIso } : item,
      ),
    )

    const { error } = await supabase
      .from('action_item_snoozes')
      .update({ snooze_until: snoozeUntilIso })
      .eq('id', row.id)

    if (error) {
      console.error('[CommandCenter] snooze longer update failed', error)
      setSnoozedItems((previous) =>
        previous.map((item) =>
          item.id === row.id ? { ...item, snooze_until: previousUntil } : item,
        ),
      )
      setUpdateErrors((previous) => ({
        ...previous,
        [row.id]: 'Update failed — try again',
      }))
    }
  }

  if (!isOpen) {
    return null
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close snoozed items panel"
        onClick={onClose}
        className="fixed inset-0 border-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex: 300,
          cursor: 'default',
        }}
      />

      <div
        className="fixed top-0 right-0 bottom-0 flex flex-col bg-white shadow-xl"
        style={{
          width: '100vw',
          maxWidth: '480px',
          height: '100vh',
          zIndex: 301,
          transform: slideIn ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
        }}
      >
        <header
          className="shrink-0"
          style={{
            backgroundColor: '#fee2e2',
            padding: '12px 16px',
            borderBottom: '0.5px solid #fecaca',
          }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#991b1b',
                }}
              >
                Action Items — Snoozed
              </h2>
              <p
                style={{
                  fontSize: '11px',
                  color: '#991b1b',
                  opacity: 0.75,
                  marginTop: '4px',
                }}
              >
                Snoozed items wake up automatically. Restore to return an item to
                your Action Items list.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 hover:bg-[#fecaca]"
              style={{ color: '#991b1b', border: 'none', background: 'none' }}
            >
              <IconX size={20} stroke={2} />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div
              className="flex items-center justify-center py-12"
              style={{ color: '#9ca3af', fontSize: '12px' }}
            >
              Loading...
            </div>
          ) : snoozedItems.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <IconZzz size={32} color="#D1D5DB" stroke={1.5} />
              <p
                className="mt-4"
                style={{ fontSize: '14px', color: '#6B7280' }}
              >
                No snoozed items
              </p>
              <p
                className="mt-2"
                style={{ fontSize: '12px', color: '#9CA3AF' }}
              >
                Items you snooze from Action Items will appear here.
              </p>
            </div>
          ) : (
            snoozedItems.map((snoozeItem) => {
              const title = snoozeItem.events?.[0]?.event_name
                ? getDraftActionTitle({
                    id: snoozeItem.events[0].id,
                    event_name: snoozeItem.events[0].event_name,
                    event_date: snoozeItem.events[0].event_date,
                    created_at: snoozeItem.events[0].created_at,
                    status: snoozeItem.events[0].status,
                  })
                : 'Unknown event'
              const reasonSubtext = snoozeItem.events?.[0]?.event_name
                ? getDraftActionSubtext({
                    id: snoozeItem.events[0].id,
                    event_name: snoozeItem.events[0].event_name,
                    event_date: snoozeItem.events[0].event_date,
                    created_at: snoozeItem.events[0].created_at,
                    status: snoozeItem.events[0].status,
                  })
                : null

              return (
                <div
                  key={snoozeItem.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '12px',
                    padding: '12px 16px',
                    borderBottom: '1px solid #F3F4F6',
                  }}
                >
                  <div className="min-w-0 flex-1">
                    {snoozeItem.event_id ? (
                      <button
                        type="button"
                        onClick={() =>
                          window.open(`/event/${snoozeItem.event_id}`, '_blank')
                        }
                        className="text-left hover:underline"
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#1B3A5C',
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          lineHeight: 1.3,
                        }}
                      >
                        {title}
                      </button>
                    ) : (
                      <p
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: '#1B3A5C',
                          lineHeight: 1.3,
                        }}
                      >
                        {title}
                      </p>
                    )}
                    {reasonSubtext ? (
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#6B7280',
                          marginTop: '4px',
                          lineHeight: 1.3,
                        }}
                      >
                        {reasonSubtext}
                      </p>
                    ) : null}
                    <p
                      style={{
                        fontSize: '12px',
                        color: '#6B7280',
                        marginTop: '2px',
                        lineHeight: 1.3,
                      }}
                    >
                      {getSnoozeWakeUpLabel(snoozeItem.snooze_until)}
                    </p>
                    {restoreErrors[snoozeItem.id] ? (
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#ef4444',
                          marginTop: '4px',
                          lineHeight: 1.3,
                        }}
                      >
                        {restoreErrors[snoozeItem.id]}
                      </p>
                    ) : null}
                    {updateErrors[snoozeItem.id] ? (
                      <p
                        style={{
                          fontSize: '12px',
                          color: '#ef4444',
                          marginTop: '4px',
                          lineHeight: 1.3,
                        }}
                      >
                        {updateErrors[snoozeItem.id]}
                      </p>
                    ) : null}
                  </div>
                  <div
                    className="flex shrink-0 items-center"
                    style={{ gap: '12px' }}
                  >
                    <button
                      type="button"
                      onClick={() => void handleRestore(snoozeItem)}
                      className="hover:underline"
                      style={{
                        fontSize: '12px',
                        color: '#1B3A5C',
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                      }}
                    >
                      Restore
                    </button>
                    <button
                      type="button"
                      onClick={(clickEvent) => {
                        setPanelSnoozePopover({
                          snoozeId: snoozeItem.id,
                          anchorEl: clickEvent.currentTarget,
                        })
                      }}
                      className="hover:underline"
                      style={{
                        fontSize: '12px',
                        color: '#6B7280',
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                      }}
                    >
                      Snooze longer
                    </button>
                  </div>
                </div>
              )
            })
          )}
        </div>
      </div>

      {panelSnoozePopover ? (
        <SnoozePopover
          anchorEl={panelSnoozePopover.anchorEl}
          zIndex={302}
          onClose={() => setPanelSnoozePopover(null)}
          onSelect={(days) => {
            const snoozeId = panelSnoozePopover.snoozeId
            setPanelSnoozePopover(null)
            const row = snoozedItems.find((item) => item.id === snoozeId)
            if (row) {
              void handleSnoozeLonger(row, days)
            }
          }}
        />
      ) : null}
    </>
  )
}

const boxStyle: CSSProperties = {
  backgroundColor: '#ffffff',
  border: '0.5px solid #e5e7eb',
  borderRadius: '8px',
  overflow: 'hidden',
}

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '8px 12px',
  borderBottom: '0.5px solid #e5e7eb',
  fontSize: '12px',
  fontWeight: 500,
}

const itemRowStyle: CSSProperties = {
  padding: '7px 12px',
  fontSize: '11px',
  borderBottom: '0.5px solid #f3f4f6',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  gap: '6px',
}

const countBadgeStyle: CSSProperties = {
  backgroundColor: 'rgba(0, 0, 0, 0.08)',
  borderRadius: '10px',
  fontSize: '11px',
  padding: '2px 7px',
}

const mutedBadgeStyle: CSSProperties = {
  ...countBadgeStyle,
  fontWeight: 400,
}

interface CommandCenterBoxProps {
  fullWidth?: boolean
  children: ReactNode
}

function CommandCenterBox({ fullWidth = false, children }: CommandCenterBoxProps) {
  return (
    <div
      style={{
        ...boxStyle,
        ...(fullWidth ? { gridColumn: '1 / -1' } : {}),
      }}
    >
      {children}
    </div>
  )
}

interface BoxHeaderProps {
  label: string
  backgroundColor: string
  color: string
  right?: ReactNode
}

function BoxHeader({ label, backgroundColor, color, right }: BoxHeaderProps) {
  return (
    <div style={{ ...headerStyle, backgroundColor, color }}>
      <span>{label}</span>
      {right ?? null}
    </div>
  )
}

interface BoxItemRowProps {
  children: ReactNode
  onClick?: () => void
}

function BoxItemRow({ children, onClick }: BoxItemRowProps) {
  return (
    <div
      className="hover:bg-gray-50"
      style={itemRowStyle}
      onClick={onClick}
      onKeyDown={
        onClick
          ? (event) => {
              if (event.key === 'Enter' || event.key === ' ') {
                event.preventDefault()
                onClick()
              }
            }
          : undefined
      }
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
    >
      {children}
    </div>
  )
}

interface ToolGridItemProps {
  icon: Icon
  title: string
  subtitle: string
}

function ToolGridItem({ icon: ItemIcon, title, subtitle }: ToolGridItemProps) {
  return (
    <button
      type="button"
      className="hover:bg-[#f3f4f6]"
      style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '8px',
        width: '100%',
        padding: '8px 12px',
        cursor: 'pointer',
        border: 'none',
        borderBottom: '0.5px solid #f3f4f6',
        backgroundColor: 'transparent',
        textAlign: 'left',
      }}
    >
      <ItemIcon size={16} color="#1B3A5C" style={{ flexShrink: 0, marginTop: '1px' }} />
      <span>
        <span
          style={{
            display: 'block',
            fontSize: '11px',
            fontWeight: 500,
            color: '#111827',
            lineHeight: 1.3,
          }}
        >
          {title}
        </span>
        <span
          style={{
            display: 'block',
            fontSize: '10px',
            color: '#9ca3af',
            lineHeight: 1.3,
          }}
        >
          {subtitle}
        </span>
      </span>
    </button>
  )
}

function CommandCenterPage() {
  const { labels, navigation } = useProductConfig()
  const { setActiveScreen } = useActiveScreen()
  const { openOverlay } = useOverlay()
  const [eventCount, setEventCount] = useState<number | null>(null)
  const [draftActionItems, setDraftActionItems] = useState<DraftActionEvent[]>([])
  const [persistedActionItems, setPersistedActionItems] = useState<
    PersistedActionItemRow[]
  >([])
  const [archivedEventIds, setArchivedEventIds] = useState<Set<string>>(new Set())
  const [snoozedEventIds, setSnoozedEventIds] = useState<Set<string>>(new Set())
  const [dismissedEventIds, setDismissedEventIds] = useState<Set<string>>(new Set())
  const [actionItemErrors, setActionItemErrors] = useState<Record<string, string>>({})
  const [snoozePopover, setSnoozePopover] = useState<{
    eventId: string
    anchorEl: HTMLElement
    itemType?: string
  } | null>(null)
  const [snoozedPanelOpen, setSnoozedPanelOpen] = useState(false)
  const snoozedFetchGenerationRef = useRef(0)

  const fetchArchivedEventIds = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error('[CommandCenter] archived actions: getUser failed', userError)
        return
      }

      const organizationId = user?.user_metadata?.organization_id
      if (typeof organizationId !== 'string' || !organizationId.trim()) {
        return
      }

      const { data, error } = await supabase
        .from('action_item_archives')
        .select('event_id')
        .eq('organization_id', organizationId.trim())

      if (error) {
        console.error('[CommandCenter] archived actions query failed', error)
        return
      }

      const ids = new Set<string>()
      for (const row of data ?? []) {
        if (typeof row.event_id === 'string' && row.event_id.length > 0) {
          ids.add(row.event_id)
        }
      }
      setArchivedEventIds(ids)
    } catch (error) {
      console.error('[CommandCenter] archived actions unexpected error', error)
    }
  }, [])

  const fetchDraftActionItems = useCallback(async () => {
    const fetchGenerationAtStart = snoozedFetchGenerationRef.current

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error('[CommandCenter] draft actions: getUser failed', userError)
        setDraftActionItems([])
        return
      }

      const organizationId = user?.user_metadata?.organization_id
      if (typeof organizationId !== 'string' || !organizationId.trim()) {
        console.error(
          '[CommandCenter] draft actions: missing organization_id in user_metadata',
          user?.user_metadata,
        )
        setDraftActionItems([])
        return
      }

      const orgId = organizationId.trim()
      const nowIso = new Date().toISOString()
      const { data: snoozeData, error: snoozeError } = await supabase
        .from('action_item_snoozes')
        .select('event_id')
        .eq('organization_id', orgId)
        .gt('snooze_until', nowIso)

      if (fetchGenerationAtStart !== snoozedFetchGenerationRef.current) {
        return
      }

      const localSnoozedEventIds = new Set<string>()
      if (snoozeError) {
        console.error('[CommandCenter] snoozed actions query failed', snoozeError)
      } else {
        for (const row of snoozeData ?? []) {
          if (typeof row.event_id === 'string' && row.event_id.length > 0) {
            localSnoozedEventIds.add(row.event_id)
          }
        }
      }

      setSnoozedEventIds(localSnoozedEventIds)

      const fortyEightHoursAgo = new Date(
        Date.now() - 48 * 60 * 60 * 1000,
      ).toISOString()
      const twoDaysFromNow = new Date(
        Date.now() + 2 * 24 * 60 * 60 * 1000,
      )
        .toISOString()
        .split('T')[0]

      const { data, error } = await supabase
        .from('events')
        .select('id, event_name, event_date, created_at, status')
        .eq('organization_id', orgId)
        .eq('status', 'draft')
        .or(`created_at.lte.${fortyEightHoursAgo},event_date.lte.${twoDaysFromNow}`)
        .order('event_date', { ascending: true })

      if (fetchGenerationAtStart !== snoozedFetchGenerationRef.current) {
        return
      }

      if (error) {
        console.error('[CommandCenter] draft actions query failed', error)
        setDraftActionItems([])
        return
      }

      const drafts = (data ?? []) as DraftActionEvent[]
      const activeDrafts = drafts.filter(
        (event) => !isSnoozeFiltered(event, localSnoozedEventIds),
      )
      setDraftActionItems(activeDrafts)
    } catch (error) {
      console.error('[CommandCenter] draft actions unexpected error', error)
      setDraftActionItems([])
    }
  }, [])

  const fetchDismissedEventIds = useCallback(async () => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error('[CommandCenter] dismissed actions: getUser failed', userError)
        return
      }

      const organizationId = user?.user_metadata?.organization_id
      if (typeof organizationId !== 'string' || !organizationId.trim()) {
        return
      }

      const { data, error } = await supabase
        .from('action_item_dismissals')
        .select('event_id')
        .eq('organization_id', organizationId.trim())

      if (error) {
        console.error('[CommandCenter] dismissed actions query failed', error)
        return
      }

      const ids = new Set<string>()
      for (const row of data ?? []) {
        if (typeof row.event_id === 'string' && row.event_id.length > 0) {
          ids.add(row.event_id)
        }
      }
      setDismissedEventIds(ids)
    } catch (error) {
      console.error('[CommandCenter] dismissed actions unexpected error', error)
    }
  }, [])

  const runComplianceScan = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const orgId = session?.user?.user_metadata?.organization_id

    if (typeof orgId !== 'string' || !orgId.trim()) {
      return
    }

    const trimmedOrgId = orgId.trim()

    const { data: staffList } = await supabase
      .from('staff')
      .select('phone, legal_name, display_name')
      .eq('organization_id', trimmedOrgId)
      .eq('status', 'active')

    if (!staffList) {
      return
    }

    for (const staff of staffList) {
      const phone =
        typeof staff.phone === 'string' ? staff.phone.trim() : ''
      const legalName =
        typeof staff.legal_name === 'string' ? staff.legal_name : ''
      if (!phone || !legalName) {
        continue
      }

      const displayName =
        typeof staff.display_name === 'string' ? staff.display_name : null

      const { data: roles } = await supabase
        .from('staff_roles')
        .select('role_name')
        .eq('staff_phone', phone)
        .eq('organization_id', trimmedOrgId)

      const { data: certs } = await supabase
        .from('staff_certifications')
        .select('cert_type')
        .eq('staff_phone', phone)
        .eq('organization_id', trimmedOrgId)

      const isBartender = (roles ?? []).some(
        (role) => role.role_name === 'bartender',
      )
      const hasTips = (certs ?? []).some((cert) => cert.cert_type === 'tips')

      if (isBartender && !hasTips) {
        const fullName =
          (displayName ?? legalName.split(' ')[0]) +
          ' ' +
          legalName.split(' ').slice(1).join(' ')

        const { error } = await supabase.from('action_items').upsert(
          {
            organization_id: trimmedOrgId,
            category: 'staff_compliance',
            priority: 'high',
            status: 'open',
            title: 'No alcohol cert on file — ' + fullName,
            description:
              fullName + ' is a bartender with no TIPS certification on file.',
            entity_type: 'staff',
            entity_id: phone,
            deep_link: 'staff-profile:' + phone + ':certifications',
            auto_resolves: true,
          },
          { onConflict: 'organization_id,entity_id,category' },
        )

        if (error) {
          console.error('[CommandCenter] compliance upsert failed', error)
        }
      } else if (isBartender && hasTips) {
        const { error } = await supabase
          .from('action_items')
          .delete()
          .eq('organization_id', trimmedOrgId)
          .eq('entity_id', phone)
          .eq('category', 'staff_compliance')

        if (error) {
          console.error('[CommandCenter] compliance delete failed', error)
        }
      }
    }
  }, [])

  const fetchOpenActionItems = useCallback(async () => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    const orgId = session?.user?.user_metadata?.organization_id

    if (typeof orgId !== 'string' || !orgId.trim()) {
      setPersistedActionItems([])
      return
    }

    const { data, error } = await supabase
      .from('action_items')
      .select(
        'id, category, entity_type, entity_id, title, description, priority, deep_link, auto_resolves, status',
      )
      .eq('organization_id', orgId.trim())
      .eq('status', 'open')
      .order('created_at', { ascending: false })

    if (error) {
      console.error('[CommandCenter] load open action items failed', error)
      setPersistedActionItems([])
      return
    }

    setPersistedActionItems((data ?? []) as PersistedActionItemRow[])
  }, [])

  useEffect(() => {
    void fetchDraftActionItems()
    void fetchArchivedEventIds()
    void fetchDismissedEventIds()

    void (async () => {
      await runComplianceScan()
      await fetchOpenActionItems()
    })()

    const intervalId = window.setInterval(() => {
      void fetchDraftActionItems()
      void fetchDismissedEventIds()
      void fetchOpenActionItems()
    }, DRAFT_ACTION_REFRESH_MS)

    return () => {
      window.clearInterval(intervalId)
    }
  }, [
    fetchDraftActionItems,
    fetchArchivedEventIds,
    fetchDismissedEventIds,
    fetchOpenActionItems,
    runComplianceScan,
  ])

  useEffect(() => {
    async function fetchEventCount() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser()

        if (userError) {
          console.error(
            '[CommandCenter] event count: getUser failed',
            userError,
          )
          setEventCount(0)
          return
        }

        const organizationId = user?.user_metadata?.organization_id
        if (typeof organizationId !== 'string' || !organizationId.trim()) {
          console.error(
            '[CommandCenter] event count: missing organization_id in user_metadata',
            user?.user_metadata,
          )
          setEventCount(0)
          return
        }

        const { count, error } = await supabase
          .from('events')
          .select('*', { count: 'exact', head: true })
          .eq('organization_id', organizationId.trim())

        if (error) {
          console.error('[CommandCenter] event count query failed', error)
          setEventCount(0)
          return
        }

        setEventCount(count ?? 0)
      } catch (error) {
        console.error('[CommandCenter] event count unexpected error', error)
        setEventCount(0)
      }
    }

    fetchEventCount()
  }, [])

  const competingEventsLabel =
    navigation.red.find((item) => item.id === 'competing_events')?.label ?? ''

  const visibleDraftActionItems = draftActionItems.filter((event) => {
    if (archivedEventIds.has(event.id)) {
      return false
    }
    if (dismissedEventIds.has(event.id)) {
      return false
    }
    if (isSnoozeFiltered(event, snoozedEventIds)) {
      return false
    }
    return true
  })

  const visibleOpenActionItems = persistedActionItems.filter((item) => {
    if (dismissedEventIds.has(item.id)) {
      return false
    }
    if (snoozedEventIds.has(item.id)) {
      return false
    }
    return true
  })

  const visibleStaffComplianceActionItems = visibleOpenActionItems.filter(
    (item) => item.category === STAFF_COMPLIANCE_CATEGORY,
  )

  const actionItemCount =
    visibleDraftActionItems.length + visibleOpenActionItems.length

  const handleViewStaffProfile = (item: PersistedActionItemRow) => {
    const parsed = parseStaffProfileDeepLink(item.deep_link)
    if (!parsed) {
      return
    }

    openOverlay('staff')
    openStaffProfileNavigation({
      phone: parsed.phone,
      tab: parsed.tab,
      scrollTarget: parsed.scroll,
    })
  }

  const handleSnoozeActionItem = async (event: DraftActionEvent, days: number) => {
    snoozedFetchGenerationRef.current += 1
    setSnoozedEventIds((previous) => new Set(previous).add(event.id))

    const revertSnooze = () => {
      setSnoozedEventIds((previous) => {
        const next = new Set(previous)
        next.delete(event.id)
        return next
      })
    }

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error('[CommandCenter] snooze action: getUser failed', userError)
        revertSnooze()
        setActionItemErrors((previous) => ({
          ...previous,
          [event.id]: 'Snooze failed — try again',
        }))
        return
      }

      const organizationId = user?.user_metadata?.organization_id
      if (typeof organizationId !== 'string' || !organizationId.trim()) {
        revertSnooze()
        setActionItemErrors((previous) => ({
          ...previous,
          [event.id]: 'Snooze failed — try again',
        }))
        return
      }

      const snoozeUntil = new Date()
      snoozeUntil.setDate(snoozeUntil.getDate() + days)

      const { error } = await supabase.from('action_item_snoozes').insert({
        organization_id: organizationId.trim(),
        item_type: DRAFT_EVENT_ITEM_TYPE,
        event_id: event.id,
        snooze_until: snoozeUntil.toISOString(),
      })

      if (error) {
        console.error('[CommandCenter] snooze action insert failed', error)
        revertSnooze()
        setActionItemErrors((previous) => ({
          ...previous,
          [event.id]: 'Snooze failed — try again',
        }))
        return
      }

      setActionItemErrors((previous) => {
        const next = { ...previous }
        delete next[event.id]
        return next
      })
    } catch (error) {
      console.error('[CommandCenter] snooze action unexpected error', error)
      revertSnooze()
      setActionItemErrors((previous) => ({
        ...previous,
        [event.id]: 'Snooze failed — try again',
      }))
    }
  }

  const handleDismissActionItem = async (
    event: DraftActionEvent,
    itemType: string,
  ) => {
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error('[CommandCenter] dismiss action: getUser failed', userError)
        setActionItemErrors((previous) => ({
          ...previous,
          [event.id]: 'Dismiss failed — try again',
        }))
        return
      }

      const organizationId = user?.user_metadata?.organization_id
      if (typeof organizationId !== 'string' || !organizationId.trim()) {
        setActionItemErrors((previous) => ({
          ...previous,
          [event.id]: 'Dismiss failed — try again',
        }))
        return
      }

      const dismissedBy =
        (typeof user?.phone === 'string' && user.phone.trim()) ||
        user?.id ||
        null

      const { error } = await supabase.from('action_item_dismissals').insert({
        organization_id: organizationId.trim(),
        item_type: itemType,
        event_id: event.id,
        dismissed_by: dismissedBy,
      })

      if (error) {
        console.error('[CommandCenter] dismiss action insert failed', error)
        setActionItemErrors((previous) => ({
          ...previous,
          [event.id]: 'Dismiss failed — try again',
        }))
        return
      }

      setDismissedEventIds((previous) => new Set(previous).add(event.id))
      setActionItemErrors((previous) => {
        const next = { ...previous }
        delete next[event.id]
        return next
      })
    } catch (error) {
      console.error('[CommandCenter] dismiss action unexpected error', error)
      setActionItemErrors((previous) => ({
        ...previous,
        [event.id]: 'Dismiss failed — try again',
      }))
    }
  }

  const handleSnoozedItemRestored = (eventId: string | null) => {
    snoozedFetchGenerationRef.current += 1
    if (!eventId) {
      return
    }
    setSnoozedEventIds((previous) => {
      const next = new Set(previous)
      next.delete(eventId)
      return next
    })
  }

  const handleSnoozedItemRestoreUndone = (eventId: string | null) => {
    snoozedFetchGenerationRef.current += 1
    if (!eventId) {
      return
    }
    setSnoozedEventIds((previous) => new Set(previous).add(eventId))
  }

  const vendorAlertCount = 0
  const highlightCount = 0
  const competingEventCount = 0
  const inboxNeedsDecision = 0
  const inboxHumanRequired = 0
  const inboxResolved = 0

  const currentMonthYear = new Date().toLocaleDateString(undefined, {
    month: 'long',
    year: 'numeric',
  })

  const leftColumnTools = [
    {
      icon: IconSearch,
      title: labels.cc_tool_competing_event_search,
      subtitle: labels.cc_tool_competing_event_search_subtitle,
    },
    {
      icon: IconMapPin,
      title: labels.cc_tool_traffic_query,
      subtitle: labels.cc_tool_traffic_query_subtitle,
    },
    {
      icon: IconActivity,
      title: labels.cc_tool_roster_health,
      subtitle: labels.cc_tool_roster_health_subtitle,
    },
  ]

  const rightColumnTools = [
    {
      icon: IconCloud,
      title: labels.cc_tool_weather_query,
      subtitle: labels.cc_tool_weather_query_subtitle,
    },
    {
      icon: IconSpeakerphone,
      title: labels.cc_tool_broadcast_all,
      subtitle: labels.cc_tool_broadcast_all_subtitle,
    },
    {
      icon: IconHeartRateMonitor,
      title: labels.cc_tool_availability_pulse,
      subtitle: labels.cc_tool_availability_pulse_subtitle,
    },
  ]

  return (
    <div
      className="min-h-full"
      style={{ backgroundColor: '#F3F4F6', padding: '12px 14px' }}
    >
      {eventCount === 0 ? (
        <div
          style={{
            backgroundColor: 'rgba(27, 58, 92, 0.08)',
            padding: '16px',
            borderRadius: '8px',
            marginBottom: '10px',
          }}
        >
          <p
            style={{
              fontSize: '15px',
              fontWeight: 600,
              color: '#1B3A5C',
            }}
          >
            {labels.es_cc_no_events_headline}
          </p>
          <p
            style={{
              fontSize: '12px',
              color: '#6b7280',
              marginTop: '6px',
              maxWidth: '560px',
            }}
          >
            {labels.es_cc_no_events_body}
          </p>
          <button
            type="button"
            className="rounded bg-brand-navy px-4 py-2 text-sm font-medium text-white hover:opacity-90"
            style={{ marginTop: '12px' }}
            onClick={() => setActiveScreen('calendar')}
          >
            {labels.es_cc_no_events_cta}
          </button>
          <p
            style={{
              fontSize: '11px',
              color: '#9ca3af',
              marginTop: '10px',
              maxWidth: '560px',
            }}
          >
            {labels.es_cc_no_events_secondary}
          </p>
        </div>
      ) : null}

      <div
        className="grid grid-cols-2"
        style={{ gap: '10px' }}
      >
        <CommandCenterBox fullWidth>
          <BoxHeader
            label={labels.cc_action_items}
            backgroundColor="#fee2e2"
            color="#991b1b"
            right={
              <div className="flex items-center" style={{ gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => setSnoozedPanelOpen(true)}
                  className="hover:underline"
                  style={{
                    fontSize: '11px',
                    color: '#991b1b',
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    textDecoration: 'none',
                  }}
                >
                  Snooze List
                </button>
                <span style={{ ...countBadgeStyle, padding: '2px 10px' }}>
                  To-Do: {actionItemCount}
                </span>
              </div>
            }
          />
          {visibleDraftActionItems.length === 0 &&
          visibleStaffComplianceActionItems.length === 0 ? (
            <BoxItemRow>
              <div
                className="flex w-full items-center justify-center text-gray-400"
                style={{ gap: '6px', fontSize: '11px', padding: '17px 0' }}
              >
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor: '#ef4444',
                    flexShrink: 0,
                  }}
                  aria-hidden="true"
                />
                <span>{labels.cc_no_open_action_items}</span>
                <span aria-hidden="true">·</span>
                <span>{labels.cc_all_clear_subtext}</span>
              </div>
            </BoxItemRow>
          ) : (
            <>
            {visibleDraftActionItems.map((event) => {
              const itemType = DRAFT_EVENT_ITEM_TYPE
              const showDismiss = !isSystemResolvableItemType(itemType)

              return (
              <div
                key={event.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderBottom: '0.5px solid #f3f4f6',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#C0392B',
                    flexShrink: 0,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#1B3A5C',
                      lineHeight: 1.3,
                    }}
                  >
                    {getDraftActionTitle(event)}
                  </p>
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#6b7280',
                      marginTop: '2px',
                      lineHeight: 1.3,
                    }}
                  >
                    {getDraftActionSubtext(event)}
                  </p>
                  {actionItemErrors[event.id] ? (
                    <p
                      style={{
                        fontSize: '12px',
                        color: '#ef4444',
                        marginTop: '4px',
                        lineHeight: 1.3,
                      }}
                    >
                      {actionItemErrors[event.id]}
                    </p>
                  ) : null}
                </div>
                <div
                  className="flex shrink-0 items-center"
                  style={{ gap: '12px' }}
                >
                  <button
                    type="button"
                    onClick={() => window.open(`/event/${event.id}`, '_blank')}
                    className="hover:underline"
                    style={{
                      fontSize: '12px',
                      color: '#1B3A5C',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    Review
                  </button>
                  <button
                    type="button"
                    onClick={(clickEvent) => {
                      setSnoozePopover({
                        eventId: event.id,
                        anchorEl: clickEvent.currentTarget,
                        itemType: DRAFT_EVENT_ITEM_TYPE,
                      })
                    }}
                    style={{
                      fontSize: '12px',
                      color: '#6B7280',
                      cursor: 'pointer',
                      background: 'none',
                      border: 'none',
                      padding: 0,
                    }}
                  >
                    Snooze
                  </button>
                  {showDismiss ? (
                    <button
                      type="button"
                      onClick={() =>
                        void handleDismissActionItem(event, itemType)
                      }
                      style={{
                        fontSize: '12px',
                        color: '#6B7280',
                        cursor: 'pointer',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                      }}
                    >
                      Dismiss
                    </button>
                  ) : null}
                </div>
              </div>
              )
            })}
            {visibleStaffComplianceActionItems.map((item) => (
              <div
                key={item.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  padding: '10px 12px',
                  borderBottom: '0.5px solid #f3f4f6',
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    backgroundColor: '#C0392B',
                    flexShrink: 0,
                  }}
                />
                <div className="min-w-0 flex-1">
                  <p
                    style={{
                      fontSize: '13px',
                      fontWeight: 500,
                      color: '#1B3A5C',
                      lineHeight: 1.3,
                    }}
                  >
                    {item.title}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleViewStaffProfile(item)}
                  className="shrink-0 hover:underline"
                  style={{
                    fontSize: '12px',
                    color: '#1B3A5C',
                    cursor: 'pointer',
                    background: 'none',
                    border: 'none',
                    padding: 0,
                    textDecoration: 'underline',
                  }}
                >
                  View Profile
                </button>
              </div>
            ))}
            </>
          )}
        </CommandCenterBox>

        <CommandCenterBox fullWidth>
          <BoxHeader
            label={labels.cc_staff_ai_inbox}
            backgroundColor="#F3F4F6"
            color="#374151"
            right={
              <span style={{ fontSize: '11px', color: '#9ca3af' }}>
                {labels.today}
              </span>
            }
          />
          <div
            className="py-4 text-center"
            style={{ fontSize: '11px', color: '#9ca3af' }}
          >
            <button
              type="button"
              className="cursor-pointer hover:underline"
            >
              {inboxNeedsDecision} {labels.cc_needs_decision}
            </button>
            <span aria-hidden="true"> · </span>
            <button
              type="button"
              className="cursor-pointer hover:underline"
            >
              {inboxHumanRequired} {labels.cc_human_required}
            </button>
            <span aria-hidden="true"> · </span>
            <button
              type="button"
              className="cursor-pointer hover:underline"
            >
              {inboxResolved} {labels.cc_resolved}
            </button>
          </div>
        </CommandCenterBox>

        <CommandCenterBox>
          <BoxHeader
            label={labels.cc_labor_overview}
            backgroundColor="#dcf5e7"
            color="#166534"
            right={
              <span style={{ fontSize: '10px', fontWeight: 400 }}>
                {labels.cc_this_week}
              </span>
            }
          />
          <p
            className="py-4 text-center text-gray-400"
            style={{ fontSize: '11px' }}
          >
            {labels.cc_no_events_this_week}
          </p>
        </CommandCenterBox>

        <CommandCenterBox>
          <BoxHeader
            label={labels.cc_vendor_alerts}
            backgroundColor="#f3f0ff"
            color="#4c3d8f"
            right={
              <span style={mutedBadgeStyle}>
                {vendorAlertCount} {labels.cc_open}
              </span>
            }
          />
          <p
            className="py-4 text-center text-gray-400"
            style={{ fontSize: '11px' }}
          >
            {labels.cc_no_vendor_alerts}
          </p>
        </CommandCenterBox>

        <CommandCenterBox>
          <BoxHeader
            label={labels.cc_highlights}
            backgroundColor="#EEF3F8"
            color="#1B3A5C"
            right={
              <span style={mutedBadgeStyle}>
                {highlightCount} {labels.cc_new}
              </span>
            }
          />
          <p
            className="py-4 text-center text-gray-400"
            style={{ fontSize: '11px' }}
          >
            {labels.cc_no_highlights_yet}
          </p>
        </CommandCenterBox>

        <CommandCenterBox>
          <BoxHeader
            label={competingEventsLabel}
            backgroundColor="#fef9c3"
            color="#854d0e"
            right={
              <span style={mutedBadgeStyle}>
                {competingEventCount} {labels.cc_alerts}
              </span>
            }
          />
          <p
            className="py-4 text-center text-gray-400"
            style={{ fontSize: '11px' }}
          >
            {labels.cc_no_competing_events_detected}
          </p>
        </CommandCenterBox>

        <CommandCenterBox fullWidth>
          <BoxHeader
            label={labels.cc_gift_cards}
            backgroundColor="#fef3c7"
            color="#92400e"
            right={
              <button
                type="button"
                className="cursor-pointer underline"
                style={{
                  fontSize: '10px',
                  color: '#92400e',
                  background: 'none',
                  border: 'none',
                  padding: 0,
                }}
              >
                {labels.cc_view_history}
              </button>
            }
          />
          <div style={{ padding: '10px 12px' }}>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: '6px',
                fontSize: '11px',
                color: '#9ca3af',
              }}
            >
              <span>{labels.cc_monthly_budget}</span>
              <span>{currentMonthYear}</span>
            </div>
            <div
              style={{
                width: '100%',
                height: '4px',
                borderRadius: '2px',
                backgroundColor: '#e5e7eb',
                overflow: 'hidden',
              }}
            >
              <div
                style={{
                  width: '0%',
                  height: '100%',
                  backgroundColor: '#C9A84C',
                }}
                aria-hidden="true"
              />
            </div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginTop: '6px',
                fontSize: '11px',
              }}
            >
              <span style={{ color: '#111827' }}>{labels.cc_budget_used}</span>
              <span style={{ color: '#9ca3af' }}>{labels.cc_budget_remaining}</span>
            </div>
            <p
              className="text-center"
              style={{
                marginTop: '12px',
                fontSize: '11px',
                color: '#9ca3af',
              }}
            >
              {labels.cc_no_gift_cards_sent}
            </p>
          </div>
        </CommandCenterBox>

        <CommandCenterBox fullWidth>
          <BoxHeader
            label={labels.cc_tools}
            backgroundColor="#f9fafb"
            color="#374151"
          />
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
            }}
          >
            <div>
              {leftColumnTools.map((tool) => (
                <ToolGridItem
                  key={tool.title}
                  icon={tool.icon}
                  title={tool.title}
                  subtitle={tool.subtitle}
                />
              ))}
            </div>
            <div>
              {rightColumnTools.map((tool) => (
                <ToolGridItem
                  key={tool.title}
                  icon={tool.icon}
                  title={tool.title}
                  subtitle={tool.subtitle}
                />
              ))}
            </div>
          </div>
        </CommandCenterBox>
      </div>

      {snoozePopover ? (
        <SnoozePopover
          anchorEl={snoozePopover.anchorEl}
          onClose={() => setSnoozePopover(null)}
          onSelect={(days) => {
            setSnoozePopover(null)
            const event = draftActionItems.find(
              (entry) => entry.id === snoozePopover.eventId,
            )
            if (event) {
              void handleSnoozeActionItem(event, days)
            }
          }}
        />
      ) : null}

      <ActionItemsSnoozedPanel
        isOpen={snoozedPanelOpen}
        onClose={() => setSnoozedPanelOpen(false)}
        onRestored={handleSnoozedItemRestored}
        onRestoreUndone={handleSnoozedItemRestoreUndone}
      />
    </div>
  )
}

export default CommandCenterPage
