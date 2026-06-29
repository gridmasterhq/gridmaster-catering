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
import { OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX } from '../shared/OverlayPanel'
import StaffProfileHistoryTab from './StaffProfileHistoryTab'
import StaffProfileCertificationsTab from './StaffProfileCertificationsTab'
import StaffProfileAvailabilityTab from './StaffProfileAvailabilityTab'
import StaffRatingBadge from '../shared/StaffRatingBadge'
import { formatCoordinatorStaffName } from '../../lib/staffDisplayName'
import {
  detectStaffComplianceIssues,
  loadStaffComplianceData,
  syncBartenderTipsComplianceForStaff,
  type StaffComplianceIssue,
} from '../../lib/staffCompliance'
import { useMinimizablePanel } from '../../hooks/useMinimizablePanel'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'
import { useTabManager } from '../TabManager'

const NAVY = '#1B3A5C'
const STAFF_PROFILE_CONTENT_MAX_WIDTH_PX = 600
const STAFF_PROFILE_MAX_WIDTH_PX =
  STAFF_PROFILE_CONTENT_MAX_WIDTH_PX + OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX
const STAFF_PROFILE_Z_INDEX = 302

const SCHEMA_ROLE_NAMES = new Set([
  'server',
  'bartender',
  'bar_back',
  'food_runner',
  'captain',
  'cit',
  'setup_crew',
  'breakdown_crew',
  'line_cook',
  'prep_cook',
  'dishwasher',
  'kitchen_runner',
  'sous_chef',
  'lead_chef',
  'driver',
  'ops_lead',
  'trainer',
])

const ROLE_EDITOR_OPTIONS: { roleName: string; label: string }[] = [
  { roleName: 'server', label: 'Server' },
  { roleName: 'bartender', label: 'Bartender' },
  { roleName: 'bar_back', label: 'Bar Back' },
  { roleName: 'food_runner', label: 'Food Runner' },
  { roleName: 'captain', label: 'Captain' },
  { roleName: 'cit', label: 'Captain In Training (CIT)' },
  { roleName: 'setup_crew', label: 'Setup Crew' },
  { roleName: 'breakdown_crew', label: 'Breakdown Crew' },
  { roleName: 'line_cook', label: 'Line Cook' },
  { roleName: 'prep_cook', label: 'Prep Cook' },
  { roleName: 'dishwasher', label: 'Dishwasher' },
  { roleName: 'kitchen_runner', label: 'Kitchen Runner' },
  { roleName: 'sous_chef', label: 'Sous Chef' },
  { roleName: 'lead_chef', label: 'Lead Chef' },
  { roleName: 'driver', label: 'Driver' },
  { roleName: 'ops_lead', label: 'Ops Lead' },
  { roleName: 'trainer', label: 'Trainer' },
]

function normalizeLoadedRoleName(roleName: string): string {
  return roleName.trim().toLowerCase().replace(/\s+/g, '_')
}

type StaffStatus = 'active' | 'alumni' | 'not_active' | 'archived'

export type ProfileTab =
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
  basic_availability: string | null
  staff_roles: StaffRoleRow[] | null
}

export interface StaffProfileSessionState {
  id: string
  phone: string
  tabId: string
  tabLabel: string
  staff: StaffProfileStaffMember
  profileTab: ProfileTab
  certificationsScrollTarget?: string | null
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
    subLabelLine1: 'Schedule · Blackouts',
    subLabelLine2: 'Recurring',
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
    label: 'Personnel Notes',
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

function rolesSelectionEqual(left: string[], right: string[]): boolean {
  const sortedLeft = [...left].sort()
  const sortedRight = [...right].sort()

  return (
    sortedLeft.length === sortedRight.length &&
    sortedLeft.every((role, index) => role === sortedRight[index])
  )
}

function resolveEditorPrimaryRole(
  roles: string[],
  primaryHint: string | null | undefined,
): string {
  if (roles.length === 0) {
    return ''
  }

  const normalizedHint = primaryHint
    ? normalizeLoadedRoleName(primaryHint)
    : ''

  if (normalizedHint && roles.includes(normalizedHint)) {
    return normalizedHint
  }

  return roles[0]
}

function rolesFromStaffMember(staff: StaffProfileStaffMember): {
  roles: string[]
  primaryRole: string | null
} {
  const staffRoles = normalizeStaffRoles(staff.staff_roles)
  const roles = [
    ...new Set(
      staffRoles
        .map((row) => normalizeLoadedRoleName(row.role))
        .filter((role) => role.length > 0 && SCHEMA_ROLE_NAMES.has(role)),
    ),
  ]
  const primaryRow = staffRoles.find((row) => row.is_primary)
  const primaryRole = primaryRow?.role
    ? normalizeLoadedRoleName(primaryRow.role)
    : null

  return { roles, primaryRole }
}

function hasUnsavedInlineEdits(
  showRoleEditor: boolean,
  editorRoles: string[],
  roleEditorBaseline: string[],
  editorPrimaryRole: string,
  roleEditorPrimaryBaseline: string,
): boolean {
  return (
    showRoleEditor &&
    (!rolesSelectionEqual(editorRoles, roleEditorBaseline) ||
      editorPrimaryRole !== roleEditorPrimaryBaseline)
  )
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
  const [staff, setStaff] = useState(session.staff)
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [showRoleEditor, setShowRoleEditor] = useState(false)
  const [editorRoles, setEditorRoles] = useState<string[]>([])
  const [editorPrimaryRole, setEditorPrimaryRole] = useState('')
  const [roleEditorBaseline, setRoleEditorBaseline] = useState<string[]>([])
  const [roleEditorPrimaryBaseline, setRoleEditorPrimaryBaseline] =
    useState('')
  const [isSavingRoles, setIsSavingRoles] = useState(false)
  const [roleEditorError, setRoleEditorError] = useState<string | null>(null)
  const [complianceIssues, setComplianceIssues] = useState<
    StaffComplianceIssue[]
  >([])
  const [certificationsScrollTarget, setCertificationsScrollTarget] = useState<
    string | null
  >(session.certificationsScrollTarget ?? null)

  useEffect(() => {
    setStaff(session.staff)
  }, [session.staff])

  useEffect(() => {
    if (session.certificationsScrollTarget) {
      setCertificationsScrollTarget(session.certificationsScrollTarget)
    }
  }, [session.certificationsScrollTarget])

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
    async function loadOrganizationId() {
      const {
        data: { user },
      } = await supabase.auth.getUser()
      const orgId = user?.user_metadata?.organization_id
      if (typeof orgId !== 'string' || !orgId.trim()) {
        return
      }

      setOrganizationId(orgId.trim())
    }

    void loadOrganizationId()
  }, [])

  useEffect(() => {
    if (isMinimized || !isForeground) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (
        event.key === 'Escape' &&
        !hasUnsavedInlineEdits(
          showRoleEditor,
          editorRoles,
          roleEditorBaseline,
          editorPrimaryRole,
          roleEditorPrimaryBaseline,
        )
      ) {
        dismiss()
        onCloseSession()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    dismiss,
    editorPrimaryRole,
    editorRoles,
    isForeground,
    isMinimized,
    onCloseSession,
    roleEditorBaseline,
    roleEditorPrimaryBaseline,
    showRoleEditor,
  ])

  const isPanelVisible = isForeground || hasTab(session.tabId)
  const panelVisible = slideIn && !isMinimized && isPanelVisible
  const showBackdrop = isForeground && !isMinimized
  const hasEditableFields = profileHasEditableFields(session.profileTab)
  const displayName = getStaffDisplayName(staff)
  const { profileTab } = session
  const hasUnsavedInlineEditsState = hasUnsavedInlineEdits(
    showRoleEditor,
    editorRoles,
    roleEditorBaseline,
    editorPrimaryRole,
    roleEditorPrimaryBaseline,
  )

  const handleCloseProfile = useCallback(() => {
    dismiss()
    onCloseSession()
  }, [dismiss, onCloseSession])

  const handleDiscard = useCallback(() => {
    setShowRoleEditor(false)
    setRoleEditorError(null)
    setEditorRoles([])
    setEditorPrimaryRole('')
    setRoleEditorBaseline([])
    setRoleEditorPrimaryBaseline('')
    dismiss()
    onCloseSession()
  }, [dismiss, onCloseSession])

  const openRoleEditor = () => {
    void loadRoleEditorRoles()
  }

  const resolveOrganizationId = async (): Promise<string | null> => {
    if (organizationId) {
      return organizationId
    }

    const {
      data: { user },
    } = await supabase.auth.getUser()
    const orgId = user?.user_metadata?.organization_id
    if (typeof orgId !== 'string' || !orgId.trim()) {
      return null
    }

    const resolved = orgId.trim()
    setOrganizationId(resolved)
    return resolved
  }

  const refreshStaffCompliance = useCallback(async () => {
    const orgId = await resolveOrganizationId()
    if (!orgId) {
      return
    }

    try {
      const data = await loadStaffComplianceData(orgId, staff.phone)
      setComplianceIssues(detectStaffComplianceIssues(data))
      await syncBartenderTipsComplianceForStaff(
        orgId,
        staff.phone,
        getStaffDisplayName(staff),
        data.staffRoles,
        data.certifications,
      )
    } catch (error) {
      console.error('[StaffProfile] compliance sync unexpected error', error)
    }
  }, [staff])

  const handleCertificationsScrollTargetHandled = useCallback(() => {
    setCertificationsScrollTarget(null)
  }, [])

  const handleComplianceRefresh = useCallback(() => {
    void refreshStaffCompliance()
  }, [refreshStaffCompliance])

  const handleBasicAvailabilityChange = useCallback((value: string) => {
    setStaff((previous) => ({
      ...previous,
      basic_availability: value,
    }))
  }, [])

  const staffRoleSignature = (staff.staff_roles ?? [])
    .map((role) => `${role.role}:${role.is_primary ? '1' : '0'}`)
    .sort()
    .join('|')

  useEffect(() => {
    if (!organizationId) {
      return
    }

    void refreshStaffCompliance()
  }, [organizationId, refreshStaffCompliance, staff.phone, staffRoleSignature])

  const loadRoleEditorRoles = async () => {
    setRoleEditorError(null)
    setShowRoleEditor(true)

    const applyLoadedEditorRoles = (
      roles: string[],
      primaryHint: string | null | undefined,
    ) => {
      const nextRoles = [...new Set(roles)]
      const resolvedPrimary = resolveEditorPrimaryRole(nextRoles, primaryHint)
      setEditorRoles(nextRoles)
      setEditorPrimaryRole(resolvedPrimary)
      setRoleEditorBaseline(nextRoles)
      setRoleEditorPrimaryBaseline(resolvedPrimary)
    }

    const orgId = await resolveOrganizationId()
    if (!orgId) {
      const { roles, primaryRole } = rolesFromStaffMember(staff)
      applyLoadedEditorRoles(roles, primaryRole)
      return
    }

    const { data, error } = await supabase
      .from('staff_roles')
      .select('role_name, is_primary')
      .eq('organization_id', orgId)
      .eq('staff_phone', staff.phone)

    if (error) {
      console.error('[StaffProfile] load staff_roles failed', error)
      const { roles, primaryRole } = rolesFromStaffMember(staff)
      applyLoadedEditorRoles(roles, primaryRole)
      return
    }

    const loadedRoles = (data ?? [])
      .map((row) =>
        normalizeLoadedRoleName(
          typeof row.role_name === 'string' ? row.role_name : '',
        ),
      )
      .filter((role) => role.length > 0 && SCHEMA_ROLE_NAMES.has(role))

    const primaryFromDb = (data ?? []).find((row) => row.is_primary)?.role_name
    applyLoadedEditorRoles(loadedRoles, primaryFromDb)
  }

  const cancelRoleEditor = () => {
    setShowRoleEditor(false)
    setRoleEditorError(null)
    setEditorRoles([])
    setEditorPrimaryRole('')
    setRoleEditorBaseline([])
    setRoleEditorPrimaryBaseline('')
  }

  const handleSetPrimaryRole = (role: string) => {
    if (!editorRoles.includes(role)) {
      return
    }

    setEditorPrimaryRole(role)
  }

  const toggleEditorRole = (role: string) => {
    setEditorRoles((previous) => {
      const isChecked = previous.includes(role)

      if (isChecked) {
        const next = previous.filter((item) => item !== role)
        setEditorPrimaryRole((currentPrimary) => {
          if (next.length === 0) {
            return ''
          }

          if (role === currentPrimary) {
            return next[0]
          }

          return currentPrimary
        })
        return next
      }

      const next = [...previous, role]
      setEditorPrimaryRole((currentPrimary) => {
        if (next.length === 1) {
          return role
        }

        if (!currentPrimary || !next.includes(currentPrimary)) {
          return next[0]
        }

        return currentPrimary
      })
      return next
    })
  }

  const handleSaveRoles = async () => {
    const orgId = await resolveOrganizationId()
    if (!orgId) {
      return
    }

    if (editorRoles.length === 0) {
      setRoleEditorError('Select at least one role.')
      return
    }

    setIsSavingRoles(true)
    setRoleEditorError(null)

    try {
      const primaryRole = resolveEditorPrimaryRole(editorRoles, editorPrimaryRole)
      const trainerIsPrimary = primaryRole === 'trainer'

      const { error: deleteError } = await supabase
        .from('staff_roles')
        .delete()
        .eq('organization_id', orgId)
        .eq('staff_phone', staff.phone)

      if (deleteError) {
        console.error('[StaffProfile] delete staff_roles failed', deleteError)
        setRoleEditorError('Failed to save roles — please try again.')
        return
      }

      const roleRows = editorRoles.map((role) => ({
        staff_phone: staff.phone,
        organization_id: orgId,
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

      const { error: staffUpdateError } = await supabase
        .from('staff')
        .update({
          is_trainer: trainerIsPrimary,
          trainer_designated_at: trainerIsPrimary
            ? new Date().toISOString()
            : null,
        })
        .eq('organization_id', orgId)
        .eq('phone', staff.phone)

      if (staffUpdateError) {
        console.error('[StaffProfile] update trainer status failed', staffUpdateError)
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
      setEditorRoles([])
      setEditorPrimaryRole('')
      setRoleEditorBaseline([])
      setRoleEditorPrimaryBaseline('')
      void refreshStaffCompliance()
    } catch (error) {
      console.error('[StaffProfile] save roles unexpected error', error)
      setRoleEditorError('Failed to save roles — please try again.')
    } finally {
      setIsSavingRoles(false)
    }
  }

  const handleComplianceAlertClick = (scrollTarget: string) => {
    setCertificationsScrollTarget(scrollTarget)
    onProfileTabChange('certifications')
    onFocus()
  }

  const headerTextButtonStyle: CSSProperties = {
    fontSize: '12px',
    fontWeight: 500,
    border: 'none',
    background: 'transparent',
    padding: 0,
    cursor: 'pointer',
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
          maxWidth: `${STAFF_PROFILE_MAX_WIDTH_PX}px`,
          paddingRight: `${OVERLAY_PANEL_TAB_STACK_CLEARANCE_PX}px`,
          boxSizing: 'border-box',
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
            onClose={handleCloseProfile}
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
              hasUnsavedInlineEditsState ? (
                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleDiscard}
                    className="border-none bg-transparent p-0"
                    style={{
                      ...headerTextButtonStyle,
                      color: '#FCA5A5',
                    }}
                  >
                    Discard
                  </button>
                  <button
                    type="button"
                    className="border-none bg-transparent p-0"
                    style={{
                      ...headerTextButtonStyle,
                      color: 'rgba(255,255,255,0.75)',
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

            <div className="flex shrink-0 flex-col items-end">
              <button
                type="button"
                onClick={openRoleEditor}
                style={outlineButtonStyle}
              >
                Change / Add Roles
              </button>
              {complianceIssues.length > 0 ? (
                <div
                  className="mt-2 flex flex-col items-end"
                  style={{ gap: '4px' }}
                >
                  {complianceIssues.map((issue) => (
                    <button
                      key={`${issue.type}:${issue.referenceKey}`}
                      type="button"
                      onClick={() =>
                        handleComplianceAlertClick(issue.scrollTarget)
                      }
                      className="text-left hover:underline"
                      style={{
                        fontSize: '12px',
                        color: '#C0392B',
                        background: 'none',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        lineHeight: 1.3,
                      }}
                    >
                      {issue.alertLabel}
                    </button>
                  ))}
                </div>
              ) : null}
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
                {ROLE_EDITOR_OPTIONS.map((role) => {
                  const isChecked = editorRoles.includes(role.roleName)
                  const isPrimary = editorPrimaryRole === role.roleName

                  return (
                    <div
                      key={role.roleName}
                      className="flex items-center"
                      style={{ fontSize: '13px', color: colors.text_body }}
                    >
                      <label className="flex shrink-0 items-center gap-2">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleEditorRole(role.roleName)}
                        />
                        <span>{role.label}</span>
                      </label>
                      {isChecked && isPrimary ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: colors.white,
                            backgroundColor: colors.brand_navy,
                            borderRadius: '4px',
                            padding: '2px 6px',
                            flexShrink: 0,
                            marginLeft: '12px',
                          }}
                        >
                          Primary
                        </span>
                      ) : null}
                      {isChecked && !isPrimary ? (
                        <button
                          type="button"
                          onClick={() => handleSetPrimaryRole(role.roleName)}
                          className="border-none bg-transparent p-0 hover:opacity-80"
                          style={{
                            fontSize: '13px',
                            color: colors.brand_navy,
                            textDecoration: 'underline',
                            cursor: 'pointer',
                            flexShrink: 0,
                            marginLeft: '12px',
                          }}
                        >
                          Set as Primary
                        </button>
                      ) : null}
                    </div>
                  )
                })}
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

        {profileTab === 'history' ? (
          <StaffProfileHistoryTab staff={staff} organizationId={organizationId} />
        ) : profileTab === 'certifications' ? (
          <StaffProfileCertificationsTab
            staff={staff}
            organizationId={organizationId}
            scrollTarget={certificationsScrollTarget}
            onScrollTargetHandled={handleCertificationsScrollTargetHandled}
            onComplianceRefresh={handleComplianceRefresh}
          />
        ) : profileTab === 'availability' ? (
          <StaffProfileAvailabilityTab
            staff={staff}
            organizationId={organizationId}
            onBasicAvailabilityChange={handleBasicAvailabilityChange}
          />
        ) : (
          <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-16">
            <IconClock size={32} color="#D1D5DB" stroke={1.5} />
            <p className="mt-3" style={{ fontSize: '13px', color: '#6B7280' }}>
              Coming soon
            </p>
          </div>
        )}
      </div>
    </>
  )
}
