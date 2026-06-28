import {
  type CSSProperties,
  useCallback,
  useEffect,
  useState,
} from 'react'
import {
  IconArrowLeft,
  IconClock,
  IconUser,
} from '@tabler/icons-react'
import PanelHeaderActions from '../shared/PanelHeaderActions'
import { formatCoordinatorStaffName } from '../../lib/staffDisplayName'
import { useMinimizablePanel } from '../../hooks/useMinimizablePanel'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { useTabManager } from '../TabManager'

const NAVY = '#1B3A5C'
const GOLD = '#C9A84C'
const STAFF_PROFILE_Z_INDEX = 302

type StaffStatus = 'active' | 'alumni' | 'not_active' | 'archived'

type ProfileTab =
  | 'history'
  | 'certifications'
  | 'availability'
  | 'ai_summary'
  | 'development'
  | 'personal_note'

interface StaffRoleRow {
  role: string
  is_primary: boolean
}

export interface StaffProfileStaffMember {
  phone: string
  legal_name: string
  display_name: string | null
  photo_url: string | null
  status: StaffStatus
  captain_priority: boolean
  average_rating: number | null
  rating_count: number
  starting_designation: string | null
  experience_rating: number | null
  is_priority: boolean
  created_at: string
  staff_roles: StaffRoleRow[] | null
}

export interface StaffProfileSessionState {
  id: string
  phone: string
  tabId: string
  tabLabel: string
  staff: StaffProfileStaffMember
  profileTab: ProfileTab
}

interface StaffProfilePanelProps {
  session: StaffProfileSessionState
  isForeground: boolean
  onBack: () => void
  onCloseSession: () => void
  onFocus: () => void
  onMinimized: () => void
  onProfileTabChange: (tab: ProfileTab) => void
  onRegisterActions: (
    sessionId: string,
    actions: { minimize: () => void; dismiss: () => void },
  ) => () => void
}

const profileTabs: { id: ProfileTab; label: string }[] = [
  { id: 'history', label: 'History' },
  { id: 'certifications', label: 'Certifications' },
  { id: 'availability', label: 'Availability' },
  { id: 'ai_summary', label: 'AI Summary' },
  { id: 'development', label: 'Development' },
  { id: 'personal_note', label: 'Personal Note' },
]

function profileHasEditableFields(_profileTab: ProfileTab): boolean {
  return false
}

function normalizeStaffRoles(
  roles: StaffRoleRow | StaffRoleRow[] | null | undefined,
): StaffRoleRow[] {
  if (roles == null) {
    return []
  }
  return Array.isArray(roles) ? roles : [roles]
}

function getPrimaryRole(staff: StaffProfileStaffMember): string {
  const roles = normalizeStaffRoles(staff.staff_roles)
  const primary = roles.find((role) => role.is_primary)
  return primary?.role ?? roles[0]?.role ?? 'Staff'
}

function getStaffDisplayName(staff: StaffProfileStaffMember): string {
  return formatCoordinatorStaffName(staff.display_name, staff.legal_name)
}

function formatStatusLabel(status: StaffStatus): string {
  if (status === 'not_active') {
    return 'Not Active'
  }
  if (status === 'alumni') {
    return 'Alumni'
  }
  return status.charAt(0).toUpperCase() + status.slice(1)
}

function statusBadgeStyle(status: StaffStatus): CSSProperties {
  switch (status) {
    case 'active':
      return { backgroundColor: '#DCFCE7', color: '#166534' }
    case 'alumni':
      return { backgroundColor: '#F3F4F6', color: '#6B7280' }
    case 'not_active':
      return { backgroundColor: '#F3F4F6', color: '#6B7280' }
    case 'archived':
      return { backgroundColor: '#E5E7EB', color: '#374151' }
    default:
      return { backgroundColor: '#F3F4F6', color: '#6B7280' }
  }
}

function ReadOnlyStars({
  rating,
  size = 12,
}: {
  rating: number
  size?: number
}) {
  const { rating_floors } = useProductConfig()
  const filled = Math.min(
    Math.max(Math.round(rating), 0),
    rating_floors.length,
  )

  return (
    <span style={{ fontSize: `${size}px`, lineHeight: 1 }}>
      {rating_floors.map((star) => (
        <span
          key={star}
          style={{ color: star <= filled ? GOLD : '#D1D5DB' }}
        >
          {star <= filled ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

function ExperienceRatingStars({
  rating,
  size = 14,
}: {
  rating: number
  size?: number
}) {
  const filled = Math.min(Math.max(Math.round(rating), 1), 6)

  return (
    <span
      className="inline-flex items-center"
      style={{ fontSize: `${size}px`, lineHeight: 1, gap: '2px' }}
    >
      <span style={{ fontWeight: 700, color: '#C0392B' }}>E</span>
      {[1, 2, 3, 4, 5, 6].map((star) => (
        <span
          key={star}
          style={{ color: star <= filled ? GOLD : '#D1D5DB' }}
        >
          {star <= filled ? '★' : '☆'}
        </span>
      ))}
    </span>
  )
}

function StaffProfileHeaderRating({
  staff,
}: {
  staff: StaffProfileStaffMember
}) {
  if (staff.rating_count >= 6 && staff.average_rating != null) {
    return <ReadOnlyStars rating={staff.average_rating} size={14} />
  }

  const experienceRating = staff.experience_rating
  if (
    experienceRating != null &&
    experienceRating >= 1 &&
    experienceRating <= 6 &&
    staff.rating_count < 6
  ) {
    return <ExperienceRatingStars rating={experienceRating} size={14} />
  }

  return null
}

function StaffPhoto({
  photoUrl,
  name,
  size,
}: {
  photoUrl: string | null
  name: string
  size: number
}) {
  if (photoUrl?.trim()) {
    return (
      <img
        src={photoUrl}
        alt={name}
        style={{
          width: `${size}px`,
          height: `${size}px`,
          borderRadius: '50%',
          objectFit: 'cover',
          flexShrink: 0,
        }}
      />
    )
  }

  return (
    <div
      style={{
        width: `${size}px`,
        height: `${size}px`,
        borderRadius: '50%',
        backgroundColor: '#E5E7EB',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
      }}
    >
      <IconUser size={Math.round(size * 0.45)} color="#9CA3AF" stroke={1.5} />
    </div>
  )
}

export default function StaffProfilePanel({
  session,
  isForeground,
  onBack,
  onCloseSession,
  onFocus,
  onMinimized,
  onProfileTabChange,
  onRegisterActions,
}: StaffProfilePanelProps) {
  const { labels } = useProductConfig()
  const { hasTab } = useTabManager()
  const [slideIn, setSlideIn] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)

  const handleRestore = useCallback(() => {
    onFocus()
  }, [onFocus])

  const { isMinimized, minimize, dismiss } = useMinimizablePanel({
    id: session.tabId,
    label: session.tabLabel,
    color: NAVY,
    onRestore: handleRestore,
  })

  const handleMinimize = useCallback(() => {
    minimize()
    onMinimized()
  }, [minimize, onMinimized])

  useEffect(() => {
    return onRegisterActions(session.id, { minimize: handleMinimize, dismiss })
  }, [dismiss, handleMinimize, onRegisterActions, session.id])

  useEffect(() => {
    return () => {
      dismiss()
    }
  }, [dismiss])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setSlideIn(true)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (isMinimized || !isForeground) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowConfirmDialog(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isForeground, isMinimized])

  const isPanelVisible = isForeground || hasTab(session.tabId)
  const panelVisible = slideIn && !isMinimized && isPanelVisible
  const showBackdrop = isForeground && !isMinimized
  const hasEditableFields = profileHasEditableFields(session.profileTab)
  const displayName = getStaffDisplayName(session.staff)
  const { staff, profileTab } = session

  const handleDiscard = () => {
    setShowConfirmDialog(false)
    dismiss()
    onCloseSession()
  }

  if (!isPanelVisible && !isMinimized) {
    return null
  }

  return (
    <>
      {showBackdrop ? (
        <button
          type="button"
          aria-label="Minimize staff profile"
          onClick={handleMinimize}
          className="fixed inset-0 border-none"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: STAFF_PROFILE_Z_INDEX,
            cursor: 'default',
          }}
        />
      ) : null}

      <div
        className="fixed top-0 right-0 bottom-0 flex w-full flex-col bg-white shadow-xl"
        style={{
          maxWidth: '600px',
          height: '100vh',
          zIndex: STAFF_PROFILE_Z_INDEX + 1,
          transform: panelVisible ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
          pointerEvents: isMinimized ? 'none' : 'auto',
        }}
      >
        <header
          className="flex shrink-0 items-center gap-2 border-b border-gray-200"
          style={{
            backgroundColor: NAVY,
            padding: '12px 16px',
          }}
        >
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to staff list"
            className="rounded p-1 hover:bg-white/10"
            style={{
              color: '#ffffff',
              border: 'none',
              background: 'none',
              flexShrink: 0,
            }}
          >
            <IconArrowLeft size={20} stroke={2} />
          </button>
          <h2
            className="min-w-0 flex-1 truncate"
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            {displayName}
          </h2>
          <PanelHeaderActions
            variant="dark"
            onMinimize={handleMinimize}
            onClose={() => setShowConfirmDialog(true)}
            leading={
              hasEditableFields ? (
                <button
                  type="button"
                  style={{
                    backgroundColor: '#ffffff',
                    color: NAVY,
                    fontSize: '12px',
                    fontWeight: 500,
                    borderRadius: '6px',
                    padding: '6px 14px',
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  Save Changes
                </button>
              ) : undefined
            }
            replaceActions={
              showConfirmDialog ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="border-none bg-transparent p-0"
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: '#FCA5A5',
                      cursor: 'pointer',
                    }}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowConfirmDialog(false)}
                    className="border-none bg-transparent p-0"
                    style={{
                      fontSize: '12px',
                      fontWeight: 500,
                      color: 'rgba(255,255,255,0.75)',
                      cursor: 'pointer',
                    }}
                  >
                    {labels.overlay_keep_editing}
                  </button>
                </div>
              ) : undefined
            }
          />
        </header>

        <div
          style={{
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #E5E7EB',
            padding: '16px',
          }}
        >
          <div className="flex items-start gap-3">
            <StaffPhoto
              photoUrl={staff.photo_url}
              name={displayName}
              size={56}
            />
            <div className="min-w-0 flex-1">
              <p
                style={{
                  fontSize: '13px',
                  color: '#6B7280',
                  marginTop: '2px',
                }}
              >
                {getPrimaryRole(staff)}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <StaffProfileHeaderRating staff={staff} />
                <span
                  style={{
                    ...statusBadgeStyle(staff.status),
                    fontSize: '11px',
                    fontWeight: 500,
                    borderRadius: '4px',
                    padding: '2px 8px',
                  }}
                >
                  {formatStatusLabel(staff.status)}
                </span>
              </div>
            </div>
          </div>
        </div>

        <div
          className="flex shrink-0 overflow-x-auto"
          style={{
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #E5E7EB',
          }}
        >
          {profileTabs.map((tab) => {
            const isActive = profileTab === tab.id
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => onProfileTabChange(tab.id)}
                style={{
                  fontSize: '12px',
                  fontWeight: 500,
                  padding: '10px 14px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: isActive ? NAVY : '#6B7280',
                  borderBottom: isActive
                    ? `2px solid ${NAVY}`
                    : '2px solid transparent',
                  whiteSpace: 'nowrap',
                }}
              >
                {tab.label}
              </button>
            )
          })}
        </div>

        <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-16">
          <IconClock size={32} color="#D1D5DB" stroke={1.5} />
          <p className="mt-3" style={{ fontSize: '13px', color: '#6B7280' }}>
            Coming soon
          </p>
        </div>
      </div>
    </>
  )
}
