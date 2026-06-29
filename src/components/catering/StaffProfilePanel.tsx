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
import StaffRatingBadge from '../shared/StaffRatingBadge'
import { formatCoordinatorStaffName } from '../../lib/staffDisplayName'
import { useMinimizablePanel } from '../../hooks/useMinimizablePanel'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'
import { useTabManager } from '../TabManager'

const NAVY = '#1B3A5C'
const STAFF_PROFILE_Z_INDEX = 302

const ROLE_OPTIONS = [
  'Server',
  'Bartender',
  'Bar Back',
  'Food Runner',
  'Captain',
  'CIT',
  'Setup Crew',
  'Breakdown Crew',
  'Line Cook',
  'Prep Cook',
  'Dishwasher',
  'Kitchen Runner',
  'Sous Chef',
  'Lead Chef',
  'Driver',
  'Ops Lead',
] as const

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
  is_trainer?: boolean
  trainer_designated_at?: string | null
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

const profileTabs: {
  id: ProfileTab
  label: string
  subLabelLine1: string
  subLabelLine2: string
}[] = [
  {
    id: 'history',
    label: 'History',
    subLabelLine1: 'Events · Ratings',
    subLabelLine2: 'Milestones',
  },
  {
    id: 'certifications',
    label: 'Certifications',
    subLabelLine1: 'Certs · Courses',
    subLabelLine2: 'Grades',
  },
  {
    id: 'availability',
    label: 'Availability',
    subLabelLine1: 'Schedule',
    subLabelLine2: 'Blackouts',
  },
  {
    id: 'ai_summary',
    label: 'AI Summary',
    subLabelLine1: 'Analysis',
    subLabelLine2: 'History',
  },
  {
    id: 'development',
    label: 'Development',
    subLabelLine1: 'CIT · Training',
    subLabelLine2: 'Growth',
  },
  {
    id: 'personal_note',
    label: 'Personal Note',
    subLabelLine1: 'Private notes',
    subLabelLine2: 'Coordinator only',
  },
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
  const { labels, colors } = useProductConfig()
  const { hasTab } = useTabManager()
  const [slideIn, setSlideIn] = useState(false)
  const [showConfirmDialog, setShowConfirmDialog] = useState(false)
  const [staff, setStaff] = useState(session.staff)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [isTrainer, setIsTrainer] = useState(Boolean(session.staff.is_trainer))
  const [showRoleEditor, setShowRoleEditor] = useState(false)
  const [editorRoles, setEditorRoles] = useState<string[]>([])
  const [isSavingRoles, setIsSavingRoles] = useState(false)
  const [isTogglingTrainer, setIsTogglingTrainer] = useState(false)
  const [roleEditorError, setRoleEditorError] = useState<string | null>(null)

  useEffect(() => {
    setStaff(session.staff)
    setIsTrainer(Boolean(session.staff.is_trainer))
  }, [session.staff])

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
    async function loadProfileMeta() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const orgId = user?.user_metadata?.organization_id
      if (typeof orgId !== 'string' || !orgId.trim()) {
        return
      }

      setOrganizationId(orgId.trim())

      const { data, error } = await supabase
        .from('staff')
        .select('is_trainer, trainer_designated_at')
        .eq('organization_id', orgId.trim())
        .eq('phone', session.staff.phone)
        .maybeSingle()

      if (error) {
        console.error('[StaffProfile] load trainer status failed', error)
        return
      }

      if (data) {
        setIsTrainer(Boolean(data.is_trainer))
        setStaff((previous) => ({
          ...previous,
          is_trainer: Boolean(data.is_trainer),
          trainer_designated_at:
            (data.trainer_designated_at as string | null) ?? null,
        }))
      }
    }

    void loadProfileMeta()
  }, [session.staff.phone])

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
  const displayName = getStaffDisplayName(staff)
  const { profileTab } = session

  const handleDiscard = () => {
    setShowConfirmDialog(false)
    dismiss()
    onCloseSession()
  }

  const openRoleEditor = () => {
    const currentRoles = normalizeStaffRoles(staff.staff_roles).map(
      (row) => row.role,
    )
    setEditorRoles(currentRoles)
    setRoleEditorError(null)
    setShowRoleEditor(true)
  }

  const cancelRoleEditor = () => {
    setShowRoleEditor(false)
    setRoleEditorError(null)
  }

  const toggleEditorRole = (role: string) => {
    setEditorRoles((previous) =>
      previous.includes(role)
        ? previous.filter((item) => item !== role)
        : [...previous, role],
    )
  }

  const handleSaveRoles = async () => {
    if (!organizationId) {
      return
    }

    if (editorRoles.length === 0) {
      setRoleEditorError('Select at least one role.')
      return
    }

    setIsSavingRoles(true)
    setRoleEditorError(null)

    try {
      const previousRoles = normalizeStaffRoles(staff.staff_roles)
      const previousPrimary =
        previousRoles.find((row) => row.is_primary)?.role ?? previousRoles[0]?.role
      const primaryRole =
        previousPrimary && editorRoles.includes(previousPrimary)
          ? previousPrimary
          : editorRoles[0]

      const { error: deleteError } = await supabase
        .from('staff_roles')
        .delete()
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone)

      if (deleteError) {
        console.error('[StaffProfile] delete staff_roles failed', deleteError)
        setRoleEditorError('Failed to save roles — please try again.')
        return
      }

      const roleRows = editorRoles.map((role) => ({
        staff_phone: staff.phone,
        organization_id: organizationId,
        role_name: role,
        is_primary: role === primaryRole,
      }))

      const { error: insertError } = await supabase
        .from('staff_roles')
        .insert(roleRows)

      if (insertError) {
        console.error('[StaffProfile] insert staff_roles failed', insertError)
        setRoleEditorError('Failed to save roles — please try again.')
        return
      }

      const nextRoles: StaffRoleRow[] = roleRows.map((row) => ({
        role: row.role_name,
        is_primary: row.is_primary,
      }))

      setStaff((previous) => ({
        ...previous,
        staff_roles: nextRoles,
      }))
      setShowRoleEditor(false)
    } catch (error) {
      console.error('[StaffProfile] save roles unexpected error', error)
      setRoleEditorError('Failed to save roles — please try again.')
    } finally {
      setIsSavingRoles(false)
    }
  }

  const handleToggleTrainer = async () => {
    if (!organizationId || isTogglingTrainer) {
      return
    }

    const nextIsTrainer = !isTrainer
    setIsTogglingTrainer(true)

    try {
      const { error } = await supabase
        .from('staff')
        .update({
          is_trainer: nextIsTrainer,
          trainer_designated_at: nextIsTrainer ? new Date().toISOString() : null,
        })
        .eq('organization_id', organizationId)
        .eq('phone', staff.phone)

      if (error) {
        console.error('[StaffProfile] toggle trainer failed', error)
        return
      }

      setIsTrainer(nextIsTrainer)
      setStaff((previous) => ({
        ...previous,
        is_trainer: nextIsTrainer,
        trainer_designated_at: nextIsTrainer ? new Date().toISOString() : null,
      }))
    } catch (error) {
      console.error('[StaffProfile] toggle trainer unexpected error', error)
    } finally {
      setIsTogglingTrainer(false)
    }
  }

  const outlineButtonStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '6px',
    padding: '8px 12px',
    border: `1px solid ${colors.brand_navy}`,
    backgroundColor: 'transparent',
    color: colors.brand_navy,
    cursor: 'pointer',
    whiteSpace: 'nowrap',
  }

  const solidTrainerButtonStyle: CSSProperties = {
    ...outlineButtonStyle,
    backgroundColor: colors.brand_navy,
    color: colors.white,
    border: `1px solid ${colors.brand_navy}`,
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

            <div className="min-w-0 flex-1" style={{ gap: '6px' }}>
              <p
                style={{
                  fontSize: '18px',
                  fontWeight: 700,
                  color: colors.brand_navy,
                  lineHeight: 1.3,
                }}
              >
                {displayName}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <span
                  style={{
                    fontSize: '13px',
                    color: colors.text_muted,
                  }}
                >
                  {getPrimaryRole(staff)}
                </span>
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
              <div className="mt-2">
                <StaffRatingBadge
                  experience_rating={staff.experience_rating}
                  rating_count={staff.rating_count}
                  average_rating={staff.average_rating}
                  variant="full"
                />
              </div>
            </div>

            <div
              className="flex shrink-0 flex-col"
              style={{ gap: '8px', alignItems: 'stretch' }}
            >
              <button
                type="button"
                onClick={openRoleEditor}
                style={outlineButtonStyle}
              >
                Change / Add Roles
              </button>
              <button
                type="button"
                onClick={() => void handleToggleTrainer()}
                disabled={isTogglingTrainer}
                style={isTrainer ? solidTrainerButtonStyle : outlineButtonStyle}
                aria-pressed={isTrainer}
              >
                Trainer
              </button>
            </div>
          </div>

          {showRoleEditor ? (
            <div
              className="mt-4 border-t border-gray-200 pt-4"
              style={{ borderColor: '#E5E7EB' }}
            >
              <p
                style={{
                  fontSize: '13px',
                  fontWeight: 600,
                  color: colors.brand_navy,
                  marginBottom: '12px',
                }}
              >
                Roles
              </p>
              <div
                className="flex flex-col"
                style={{ gap: '8px', maxHeight: '200px', overflowY: 'auto' }}
              >
                {ROLE_OPTIONS.map((role) => (
                  <label
                    key={role}
                    className="flex items-center gap-2"
                    style={{ fontSize: '13px', color: colors.text_body }}
                  >
                    <input
                      type="checkbox"
                      checked={editorRoles.includes(role)}
                      onChange={() => toggleEditorRole(role)}
                    />
                    {role}
                  </label>
                ))}
              </div>
              {roleEditorError ? (
                <p
                  style={{
                    fontSize: '12px',
                    color: colors.brand_red,
                    marginTop: '8px',
                  }}
                >
                  {roleEditorError}
                </p>
              ) : null}
              <div className="mt-3 flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => void handleSaveRoles()}
                  disabled={isSavingRoles}
                  style={{
                    ...solidTrainerButtonStyle,
                    opacity: isSavingRoles ? 0.7 : 1,
                  }}
                >
                  Save
                </button>
                <button
                  type="button"
                  onClick={cancelRoleEditor}
                  disabled={isSavingRoles}
                  style={outlineButtonStyle}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>

        <div
          className="flex shrink-0"
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
                className="flex min-w-0 flex-1 flex-col items-center"
                style={{
                  padding: '8px 4px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  borderBottom: isActive
                    ? `2px solid ${colors.brand_navy}`
                    : '2px solid transparent',
                }}
              >
                <span
                  style={{
                    fontSize: '12px',
                    fontWeight: 500,
                    color: isActive ? colors.brand_navy : colors.text_muted,
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}
                >
                  {tab.label}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontStyle: 'italic',
                    color: colors.text_muted,
                    textAlign: 'center',
                    lineHeight: 1.2,
                    marginTop: '2px',
                  }}
                >
                  {tab.subLabelLine1}
                </span>
                <span
                  style={{
                    fontSize: '10px',
                    fontStyle: 'italic',
                    color: colors.text_muted,
                    textAlign: 'center',
                    lineHeight: 1.2,
                  }}
                >
                  {tab.subLabelLine2}
                </span>
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
