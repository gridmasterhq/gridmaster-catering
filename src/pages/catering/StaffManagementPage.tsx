import {
  type CSSProperties,
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  IconSearch,
  IconUser,
  IconUsers,
} from '@tabler/icons-react'
import StaffProfilePanel, {
  type StaffProfileSessionState,
} from '../../components/catering/StaffProfilePanel'
import PanelHeaderActions from '../../components/shared/PanelHeaderActions'
import { formatCoordinatorStaffName } from '../../lib/staffDisplayName'
import {
  formatStaffProfileTabLabel,
  getStaffProfileTabId,
} from '../../lib/staffProfileTabs'
import { useMinimizablePanel } from '../../hooks/useMinimizablePanel'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { useTabManager } from '../../components/TabManager'
import { useOverlay } from '../../components/shared/AppShell'
import { supabase } from '../../lib/supabase'

const NAVY = '#1B3A5C'
const GOLD = '#C9A84C'

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
  'Custom',
] as const

type StaffStatus = 'active' | 'alumni' | 'not_active' | 'archived'
type FilterPill = 'all' | 'active' | 'priority' | 'archived' | 'not_active'
type SortOption = 'name' | 'phone' | 'joined' | 'rating'
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

interface StaffMember {
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

interface StaffManagementPageProps {
  onClose: () => void
  onFocus?: () => void
}

const fieldInputStyle: CSSProperties = {
  width: '100%',
  border: '1px solid #E5E7EB',
  borderRadius: '6px',
  padding: '8px 12px',
  fontSize: '13px',
}

const fieldLabelStyle: CSSProperties = {
  display: 'block',
  fontSize: '13px',
  fontWeight: 500,
  color: NAVY,
  marginBottom: '6px',
}

function normalizeStaffRoles(
  roles: StaffRoleRow | StaffRoleRow[] | null | undefined,
): StaffRoleRow[] {
  if (roles == null) {
    return []
  }
  return Array.isArray(roles) ? roles : [roles]
}

function getPrimaryRole(staff: StaffMember): string {
  const roles = normalizeStaffRoles(staff.staff_roles)
  const primary = roles.find((role) => role.is_primary)
  return primary?.role ?? roles[0]?.role ?? 'Staff'
}

function getStaffDisplayName(staff: StaffMember): string {
  return formatCoordinatorStaffName(staff.display_name, staff.legal_name)
}

function formatStartingDesignation(value: string | null | undefined): string {
  switch (value) {
    case 'new':
      return 'New'
    case 'promising':
      return 'Promising'
    case 'experienced':
      return 'Experienced'
    case 'senior':
    case 'senior_hire':
      return 'Senior'
    default:
      return value?.trim() || 'New'
  }
}

function formatPhoneToE164(raw: string): string {
  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+1${digits}`
  }
  if (digits.length === 11 && digits.startsWith('1')) {
    return `+${digits}`
  }
  if (raw.trim().startsWith('+')) {
    return `+${digits}`
  }
  return digits.length > 0 ? `+${digits}` : ''
}

function ExperienceRatingSelector({
  value,
  onChange,
  error,
}: {
  value: number
  onChange: (rating: number) => void
  error?: string
}) {
  return (
    <div style={{ marginBottom: '16px' }}>
      <span style={fieldLabelStyle}>Experience Rating (required)</span>
      <p
        style={{
          fontSize: '12px',
          color: '#6B7280',
          marginTop: '4px',
          marginBottom: '8px',
        }}
      >
        Assign based on resume, interview, and references. This is the active
        broadcast credential until the staff member completes 6 rated events,
        after which their Performance Rating takes over.
      </p>
      <div className="flex items-center" style={{ gap: '8px' }}>
        {[1, 2, 3, 4, 5, 6].map((star) => (
          <button
            key={star}
            type="button"
            onClick={() => onChange(star)}
            aria-label={`${star} stars`}
            style={{
              fontSize: '28px',
              lineHeight: 1,
              color: star <= value ? GOLD : '#D1D5DB',
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              padding: 0,
            }}
          >
            ★
          </button>
        ))}
      </div>
      {value > 0 ? (
        <p
          style={{
            fontSize: '12px',
            color: '#6B7280',
            marginTop: '8px',
          }}
        >
          Selected: {value} stars
        </p>
      ) : null}
      {error ? (
        <p
          style={{
            fontSize: '12px',
            color: '#EF4444',
            marginTop: '4px',
          }}
        >
          {error}
        </p>
      ) : null}
    </div>
  )
}

function statusDotColor(status: StaffStatus): string {
  switch (status) {
    case 'active':
      return '#22C55E'
    case 'alumni':
      return '#9CA3AF'
    case 'not_active':
      return '#9CA3AF'
    case 'archived':
      return '#374151'
    default:
      return '#9CA3AF'
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
  size = 12,
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

function StaffListCardRating({ staff }: { staff: StaffMember }) {
  if (staff.rating_count >= 6 && staff.average_rating != null) {
    return <ReadOnlyStars rating={staff.average_rating} />
  }

  const experienceRating = staff.experience_rating
  if (
    experienceRating != null &&
    experienceRating >= 1 &&
    experienceRating <= 6 &&
    staff.rating_count < 6
  ) {
    return <ExperienceRatingStars rating={experienceRating} />
  }

  return (
    <span
      style={{
        fontSize: '11px',
        color: '#6B7280',
        fontStyle: 'italic',
      }}
    >
      {formatStartingDesignation(staff.starting_designation)}
    </span>
  )
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

function sortStaffMembers(
  members: StaffMember[],
  sortBy: SortOption,
): StaffMember[] {
  const sorted = [...members]

  sorted.sort((a, b) => {
    switch (sortBy) {
      case 'rating':
        return (b.average_rating ?? 0) - (a.average_rating ?? 0)
      case 'name':
        return getStaffDisplayName(a).localeCompare(getStaffDisplayName(b))
      case 'phone':
        return a.phone.localeCompare(b.phone)
      case 'joined':
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        )
      default:
        return 0
    }
  })

  return sorted
}

function StaffManagementPage({ onClose, onFocus }: StaffManagementPageProps) {
  const { activeOverlay } = useOverlay()
  const { hasTab, restoreTab, canOpenNew, showMaxTabsNotice } = useTabManager()
  const profilePanelActionsRef = useRef(
    new Map<string, { minimize: () => void; dismiss: () => void }>(),
  )

  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPill, setFilterPill] = useState<FilterPill>('all')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [profileSessions, setProfileSessions] = useState<
    StaffProfileSessionState[]
  >([])
  const [foregroundProfileSessionId, setForegroundProfileSessionId] = useState<
    string | null
  >(null)
  const [duplicateNoticePhone, setDuplicateNoticePhone] = useState<
    string | null
  >(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [addFormSlideIn, setAddFormSlideIn] = useState(false)
  const [showAddFormConfirmClose, setShowAddFormConfirmClose] = useState(false)
  const [staffPanelSlideIn, setStaffPanelSlideIn] = useState(false)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const staffPanel = useMinimizablePanel({
    id: 'staff-mgmt',
    label: 'Staff Mgmt',
    color: NAVY,
    onRestore: onFocus,
  })
  const addFormPanel = useMinimizablePanel({
    id: 'new-staff',
    label: 'New Staff',
    color: NAVY,
    onRestore: onFocus,
  })

  const handleStaffClose = useCallback(() => {
    staffPanel.dismiss()
    addFormPanel.dismiss()
    onClose()
  }, [addFormPanel, onClose, staffPanel])

  const isProfileInProgress = useCallback(
    (phone: string) => {
      const tabId = getStaffProfileTabId(phone)
      return (
        profileSessions.some((session) => session.phone === phone) ||
        hasTab(tabId)
      )
    },
    [hasTab, profileSessions],
  )

  const focusProfileSession = useCallback(
    (sessionId: string) => {
      setDuplicateNoticePhone(null)
      setForegroundProfileSessionId(sessionId)
      onFocus?.()
    },
    [onFocus],
  )

  const closeProfileSession = useCallback((sessionId: string) => {
    profilePanelActionsRef.current.get(sessionId)?.dismiss()
    profilePanelActionsRef.current.delete(sessionId)
    setProfileSessions((previous) =>
      previous.filter((session) => session.id !== sessionId),
    )
    setForegroundProfileSessionId((current) =>
      current === sessionId ? null : current,
    )
  }, [])

  const registerProfilePanelActions = useCallback(
    (
      sessionId: string,
      actions: { minimize: () => void; dismiss: () => void },
    ) => {
      profilePanelActionsRef.current.set(sessionId, actions)
      return () => {
        profilePanelActionsRef.current.delete(sessionId)
      }
    },
    [],
  )

  const openStaffProfile = useCallback(
    (staff: StaffMember) => {
      if (isProfileInProgress(staff.phone)) {
        setDuplicateNoticePhone(staff.phone)
        return
      }

      if (!canOpenNew()) {
        showMaxTabsNotice()
        return
      }

      if (foregroundProfileSessionId) {
        profilePanelActionsRef.current
          .get(foregroundProfileSessionId)
          ?.minimize()
      }

      const session: StaffProfileSessionState = {
        id: crypto.randomUUID(),
        phone: staff.phone,
        tabId: getStaffProfileTabId(staff.phone),
        tabLabel: formatStaffProfileTabLabel(staff.display_name, staff.legal_name),
        staff,
        profileTab: 'history',
      }

      setProfileSessions((previous) => [...previous, session])
      setForegroundProfileSessionId(session.id)
      setDuplicateNoticePhone(null)
      onFocus?.()
    },
    [
      canOpenNew,
      foregroundProfileSessionId,
      isProfileInProgress,
      onFocus,
      showMaxTabsNotice,
    ],
  )

  const handleDuplicateProfileRestore = useCallback(() => {
    if (!duplicateNoticePhone) {
      return
    }

    const tabId = getStaffProfileTabId(duplicateNoticePhone)
    const existingSession = profileSessions.find(
      (session) => session.phone === duplicateNoticePhone,
    )

    if (hasTab(tabId)) {
      restoreTab(tabId)
    }

    if (existingSession) {
      focusProfileSession(existingSession.id)
      return
    }

    onFocus?.()
    setDuplicateNoticePhone(null)
  }, [
    duplicateNoticePhone,
    focusProfileSession,
    hasTab,
    onFocus,
    profileSessions,
    restoreTab,
  ])

  const handleProfileTabChange = useCallback(
    (sessionId: string, tab: ProfileTab) => {
      setProfileSessions((previous) =>
        previous.map((session) =>
          session.id === sessionId ? { ...session, profileTab: tab } : session,
        ),
      )
    },
    [],
  )

  const [legalName, setLegalName] = useState('')
  const [phone, setPhone] = useState('')
  const [primaryRole, setPrimaryRole] = useState<string>(ROLE_OPTIONS[0])
  const [customPrimaryRole, setCustomPrimaryRole] = useState('')
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>([])
  const [experienceRating, setExperienceRating] = useState(0)
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const loadStaff = useCallback(async (orgId: string) => {
    setLoading(true)

    const { data: staffData, error } = await supabase
      .from('staff')
      .select(
        'phone, legal_name, display_name, photo_url, status, captain_priority, average_rating, rating_count, starting_designation, experience_rating, is_priority, created_at',
      )
      .eq('organization_id', orgId)

    if (error) {
      console.error('[StaffManagement] load staff failed', error)
      setStaffMembers([])
      setLoading(false)
      return
    }

    const phones = (staffData ?? []).map((row) => row.phone as string)
    const rolesByPhone = new Map<string, StaffRoleRow[]>()

    if (phones.length > 0) {
      const { data: rolesData, error: rolesError } = await supabase
        .from('staff_roles')
        .select('staff_phone, role_name, is_primary')
        .eq('organization_id', orgId)
        .in('staff_phone', phones)

      if (rolesError) {
        console.error('[StaffManagement] load staff_roles failed', rolesError)
      } else {
        for (const row of rolesData ?? []) {
          const staffPhone =
            typeof row.staff_phone === 'string' ? row.staff_phone : ''
          const roleName =
            typeof row.role_name === 'string' ? row.role_name : ''
          if (!staffPhone || !roleName) {
            continue
          }

          const existing = rolesByPhone.get(staffPhone) ?? []
          existing.push({
            role: roleName,
            is_primary: Boolean(row.is_primary),
          })
          rolesByPhone.set(staffPhone, existing)
        }
      }
    }

    const merged: StaffMember[] = (staffData ?? []).map((row) => ({
      phone: row.phone as string,
      legal_name: row.legal_name as string,
      display_name: (row.display_name as string | null) ?? null,
      photo_url: (row.photo_url as string | null) ?? null,
      status: row.status as StaffStatus,
      captain_priority: Boolean(row.captain_priority),
      average_rating: (row.average_rating as number | null) ?? null,
      rating_count: (row.rating_count as number) ?? 0,
      starting_designation: (row.starting_designation as string | null) ?? null,
      experience_rating: (row.experience_rating as number | null) ?? null,
      is_priority: Boolean(row.is_priority),
      created_at: row.created_at as string,
      staff_roles: rolesByPhone.get(row.phone as string) ?? [],
    }))

    setStaffMembers(merged)
    setLoading(false)
  }, [])

  useEffect(() => {
    async function init() {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) {
        console.error('[StaffManagement] getUser failed', userError)
        setLoading(false)
        return
      }

      const orgId = user?.user_metadata?.organization_id
      if (typeof orgId !== 'string' || !orgId.trim()) {
        console.error('[StaffManagement] missing organization_id')
        setLoading(false)
        return
      }

      setOrganizationId(orgId.trim())
      await loadStaff(orgId.trim())
    }

    void init()
  }, [loadStaff])

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setStaffPanelSlideIn(true)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [])

  useEffect(() => {
    if (!duplicateNoticePhone) {
      return
    }

    const timer = window.setTimeout(() => {
      setDuplicateNoticePhone(null)
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [duplicateNoticePhone])

  useEffect(() => {
    if (staffPanel.isMinimized) {
      return
    }

    const staffHiddenByAddForm = showAddForm && !addFormPanel.isMinimized
    if (
      staffHiddenByAddForm ||
      staffPanel.isMinimized ||
      foregroundProfileSessionId !== null
    ) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        handleStaffClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [
    staffPanel.isMinimized,
    showAddForm,
    addFormPanel.isMinimized,
    foregroundProfileSessionId,
    handleStaffClose,
  ])

  useEffect(() => {
    if (!successToast) {
      return
    }

    const timer = window.setTimeout(() => {
      setSuccessToast(null)
    }, 5000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [successToast])

  useEffect(() => {
    if (!showAddForm) {
      setAddFormSlideIn(false)
      setShowAddFormConfirmClose(false)
      return
    }

    const frame = requestAnimationFrame(() => {
      setAddFormSlideIn(true)
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [showAddForm])

  const filteredStaff = useMemo(() => {
    const term = searchTerm.trim().toLowerCase()

    let result = staffMembers.filter((staff) => {
      if (term) {
        const haystack = [
          staff.display_name,
          staff.legal_name,
          staff.phone,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        if (!haystack.includes(term)) {
          return false
        }
      }

      switch (filterPill) {
        case 'active':
          return staff.status === 'active'
        case 'archived':
          return staff.status === 'archived'
        case 'not_active':
          return staff.status === 'not_active'
        case 'priority':
          return staff.is_priority
        default:
          return true
      }
    })

    result = sortStaffMembers(result, sortBy)
    return result
  }, [staffMembers, searchTerm, filterPill, sortBy])

  const availableSecondaryRoles = useMemo(() => {
    const resolvedPrimary =
      primaryRole === 'Custom' ? customPrimaryRole.trim() : primaryRole
    return ROLE_OPTIONS.filter(
      (role) => role !== 'Custom' && role !== resolvedPrimary,
    )
  }, [primaryRole, customPrimaryRole])

  const resetAddForm = () => {
    setLegalName('')
    setPhone('')
    setPrimaryRole(ROLE_OPTIONS[0])
    setCustomPrimaryRole('')
    setSecondaryRoles([])
    setExperienceRating(0)
    setFormErrors({})
    setFormSubmitError(null)
  }

  const handleOpenAddForm = () => {
    if (showAddForm && addFormPanel.isMinimized) {
      addFormPanel.restore()
      return
    }

    if (!addFormPanel.canOpen()) {
      return
    }

    resetAddForm()
    setShowAddForm(true)
  }

  const handleCloseAddForm = () => {
    setShowAddFormConfirmClose(false)
    addFormPanel.dismiss()
    setShowAddForm(false)
    resetAddForm()
  }

  useEffect(() => {
    if (!showAddForm || addFormPanel.isMinimized) {
      return
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setShowAddFormConfirmClose(true)
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [showAddForm, addFormPanel.isMinimized])

  const handleToggleSecondaryRole = (role: string) => {
    setSecondaryRoles((previous) =>
      previous.includes(role)
        ? previous.filter((item) => item !== role)
        : [...previous, role],
    )
  }

  const handleAddStaff = async (event: FormEvent) => {
    event.preventDefault()
    if (!organizationId) {
      return
    }

    const errors: Record<string, string> = {}
    const trimmedLegalName = legalName.trim()
    const trimmedPhone = phone.trim()
    const resolvedPrimary =
      primaryRole === 'Custom' ? customPrimaryRole.trim() : primaryRole

    if (!trimmedLegalName) {
      errors.legalName = 'Legal name is required'
    }
    if (!trimmedPhone) {
      errors.phone = 'Phone number is required'
    }
    if (!resolvedPrimary) {
      errors.primaryRole = 'Primary role is required'
    }
    if (experienceRating < 1) {
      errors.experienceRating = 'Please assign an Experience Rating'
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors)
      return
    }

    const e164Phone = formatPhoneToE164(trimmedPhone)
    if (!e164Phone) {
      setFormErrors({ phone: 'Enter a valid phone number' })
      return
    }

    setFormErrors({})
    setFormSubmitError(null)
    setIsSaving(true)

    try {
      const { data: existing, error: duplicateError } = await supabase
        .from('staff')
        .select('phone')
        .eq('organization_id', organizationId)
        .eq('phone', e164Phone)
        .maybeSingle()

      if (duplicateError) {
        console.error('[StaffManagement] duplicate check failed', duplicateError)
        setFormSubmitError('Failed to add staff member — please try again.')
        return
      }

      if (existing) {
        setFormErrors({
          phone: 'A staff member with this phone number already exists.',
        })
        return
      }

      const { error: staffError } = await supabase.from('staff').insert({
        phone: e164Phone,
        organization_id: organizationId,
        legal_name: trimmedLegalName,
        status: 'active',
        captain_priority: false,
        rating_count: 0,
        experience_rating: experienceRating,
        is_priority: false,
      })

      if (staffError) {
        console.error('[StaffManagement] staff insert failed', staffError)
        setFormSubmitError('Failed to add staff member — please try again.')
        return
      }

      const roleRows = [
        {
          staff_phone: e164Phone,
          organization_id: organizationId,
          role_name: resolvedPrimary,
          is_primary: true,
        },
        ...secondaryRoles.map((role) => ({
          staff_phone: e164Phone,
          organization_id: organizationId,
          role_name: role,
          is_primary: false,
        })),
      ]

      const { error: rolesError } = await supabase
        .from('staff_roles')
        .insert(roleRows)

      if (rolesError) {
        console.error('[StaffManagement] staff_roles insert failed', rolesError)
        setFormSubmitError('Failed to add staff member — please try again.')
        return
      }

      await loadStaff(organizationId)
      addFormPanel.dismiss()
      setShowAddForm(false)
      setShowAddFormConfirmClose(false)
      resetAddForm()
      setSuccessToast(
        'Staff member added. Onboarding SMS will be sent when messaging is enabled.',
      )
    } catch (error) {
      console.error('[StaffManagement] add staff unexpected error', error)
      setFormSubmitError('Failed to add staff member — please try again.')
    } finally {
      setIsSaving(false)
    }
  }

  const filterPills: { id: FilterPill; label: string }[] = [
    { id: 'all', label: 'All' },
    { id: 'active', label: 'Active' },
    { id: 'priority', label: 'Priority' },
    { id: 'archived', label: 'Archived' },
    { id: 'not_active', label: 'Not Active' },
  ]

  const duplicateNoticeLabel = useMemo(() => {
    if (!duplicateNoticePhone) {
      return null
    }

    const staff =
      profileSessions.find(
        (session) => session.phone === duplicateNoticePhone,
      )?.staff ??
      staffMembers.find((member) => member.phone === duplicateNoticePhone)

    if (!staff) {
      return duplicateNoticePhone
    }

    return formatStaffProfileTabLabel(staff.display_name, staff.legal_name)
  }, [duplicateNoticePhone, profileSessions, staffMembers])

  const staffHiddenByAddForm = showAddForm && !addFormPanel.isMinimized
  const showStaffListPanel =
    activeOverlay === 'staff' ||
    staffPanel.isMinimized ||
    hasTab('staff-mgmt')
  const showStaffBackdrop =
    showStaffListPanel &&
    staffPanelSlideIn &&
    !staffPanel.isMinimized &&
    !staffHiddenByAddForm &&
    foregroundProfileSessionId === null
  const staffPanelTransform =
    !showStaffListPanel ||
    staffPanel.isMinimized ||
    staffHiddenByAddForm
      ? 'translateX(100%)'
      : staffPanelSlideIn
        ? 'translateX(0)'
        : 'translateX(100%)'

  return (
    <>
      {showStaffBackdrop ? (
        <button
          type="button"
          aria-label="Close staff management"
          onClick={handleStaffClose}
          className="fixed inset-0 border-none"
          style={{
            backgroundColor: 'rgba(0, 0, 0, 0.3)',
            zIndex: 300,
            cursor: 'default',
          }}
        />
      ) : null}

      <div
        className="fixed top-0 right-0 bottom-0 flex flex-col bg-white shadow-xl"
        style={{
          width: '100vw',
          maxWidth: '680px',
          height: '100vh',
          zIndex: 301,
          transform: staffPanelTransform,
          transition: 'transform 0.2s ease',
          pointerEvents:
            !showStaffListPanel ||
            staffPanel.isMinimized ||
            staffHiddenByAddForm
              ? 'none'
              : 'auto',
        }}
      >
        <header
          className="flex shrink-0 items-center justify-between gap-3"
          style={{
            backgroundColor: NAVY,
            padding: '12px 16px',
          }}
        >
          <h2
            style={{
              fontSize: '16px',
              fontWeight: 600,
              color: '#ffffff',
            }}
          >
            Staff Management
          </h2>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenAddForm}
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
              Add New Staff
            </button>
            <PanelHeaderActions
              variant="dark"
              onMinimize={() => staffPanel.minimize()}
              onClose={handleStaffClose}
            />
          </div>
        </header>

        <div
          style={{
            backgroundColor: '#ffffff',
            borderBottom: '1px solid #E5E7EB',
            padding: '12px 16px',
          }}
        >
          <div className="relative">
            <IconSearch
              size={16}
              color="#9CA3AF"
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
              }}
            />
            <input
              type="search"
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="Search by name or phone..."
              style={{
                ...fieldInputStyle,
                paddingLeft: '36px',
              }}
            />
          </div>
          <div
            className="mt-2 flex items-center justify-between gap-3"
            style={{ flexWrap: 'wrap' }}
          >
            <div className="flex flex-wrap items-center" style={{ gap: '8px' }}>
              {filterPills.map((pill) => {
                const isActive = filterPill === pill.id
                return (
                  <button
                    key={pill.id}
                    type="button"
                    onClick={() => setFilterPill(pill.id)}
                    style={{
                      fontSize: '11px',
                      fontWeight: 500,
                      padding: '4px 12px',
                      borderRadius: '20px',
                      border: isActive ? 'none' : '1px solid #E5E7EB',
                      backgroundColor: isActive ? NAVY : '#ffffff',
                      color: isActive ? '#ffffff' : '#6B7280',
                      cursor: 'pointer',
                    }}
                  >
                    {pill.label}
                  </button>
                )
              })}
            </div>
            <select
              value={sortBy}
              onChange={(event) =>
                setSortBy(event.target.value as SortOption)
              }
              style={{
                fontSize: '11px',
                color: '#6B7280',
                border: '1px solid #E5E7EB',
                borderRadius: '6px',
                padding: '4px 8px',
                backgroundColor: '#ffffff',
              }}
            >
              <option value="name">Sort: Name</option>
              <option value="phone">Sort: Phone</option>
              <option value="joined">Sort: Joined</option>
              <option value="rating">Sort: Rating</option>
            </select>
          </div>
        </div>

        <div className="relative min-h-0 flex-1 overflow-y-auto">
          {loading ? (
            <div
              className="flex items-center justify-center py-16"
              style={{ color: '#9CA3AF', fontSize: '12px' }}
            >
              Loading...
            </div>
          ) : staffMembers.length === 0 ? (
            <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
              <IconUsers size={40} color="#D1D5DB" stroke={1.5} />
              <p
                className="mt-4"
                style={{ fontSize: '14px', color: '#6B7280' }}
              >
                No staff added yet
              </p>
              <p
                className="mt-2"
                style={{ fontSize: '12px', color: '#9CA3AF' }}
              >
                Click Add New Staff to add your first team member.
              </p>
            </div>
          ) : filteredStaff.length === 0 ? (
            <div
              className="flex items-center justify-center py-16"
              style={{ color: '#9CA3AF', fontSize: '13px' }}
            >
              No staff match your search or filters.
            </div>
          ) : (
            filteredStaff.map((staff) => {
              const displayName = getStaffDisplayName(staff)
              const primaryRoleLabel = getPrimaryRole(staff)

              return (
                <button
                  key={staff.phone}
                  type="button"
                  onClick={() => openStaffProfile(staff)}
                  className="flex w-full items-center hover:bg-[#F9FAFB]"
                  style={{
                    gap: '8px',
                    padding: '12px 16px',
                    borderBottom: '1px solid #F3F4F6',
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    textAlign: 'left',
                  }}
                >
                  <span
                    aria-hidden="true"
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: statusDotColor(staff.status),
                      flexShrink: 0,
                    }}
                  />
                  <StaffPhoto
                    photoUrl={staff.photo_url}
                    name={displayName}
                    size={44}
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        style={{
                          fontSize: '14px',
                          fontWeight: 700,
                          color: NAVY,
                        }}
                      >
                        {displayName}
                      </span>
                      {staff.is_priority ? (
                        <span
                          style={{
                            fontSize: '10px',
                            backgroundColor: NAVY,
                            color: '#ffffff',
                            borderRadius: '4px',
                            padding: '2px 6px',
                            fontWeight: 500,
                          }}
                        >
                          Captain
                        </span>
                      ) : null}
                    </div>
                    <p
                      style={{
                        fontSize: '12px',
                        color: '#6B7280',
                        marginTop: '2px',
                      }}
                    >
                      {primaryRoleLabel}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-end">
                    <StaffListCardRating staff={staff} />
                  </div>
                </button>
              )
            })
          )}
        </div>

        {successToast ? (
          <div
            style={{
              position: 'absolute',
              left: '16px',
              right: '16px',
              bottom: '16px',
              backgroundColor: '#DCFCE7',
              color: '#166534',
              borderRadius: '6px',
              padding: '10px 12px',
              fontSize: '13px',
              zIndex: 2,
            }}
          >
            {successToast}
          </div>
        ) : null}
      </div>

      {profileSessions.map((session) => (
        <StaffProfilePanel
          key={session.id}
          session={session}
          isForeground={foregroundProfileSessionId === session.id}
          onBack={() => closeProfileSession(session.id)}
          onCloseSession={() => closeProfileSession(session.id)}
          onFocus={() => focusProfileSession(session.id)}
          onMinimized={() => {
            setForegroundProfileSessionId((current) =>
              current === session.id ? null : current,
            )
          }}
          onProfileTabChange={(tab) => handleProfileTabChange(session.id, tab)}
          onRegisterActions={registerProfilePanelActions}
        />
      ))}

      {duplicateNoticeLabel ? (
        <StaffProfileDuplicateNotice
          label={duplicateNoticeLabel}
          onRestore={handleDuplicateProfileRestore}
        />
      ) : null}

      {showAddForm ? (
        <>
          {!addFormPanel.isMinimized ? (
            <button
              type="button"
              aria-label="Minimize add staff form"
              onClick={() => addFormPanel.minimize()}
              className="fixed inset-0 border-none"
              style={{
                backgroundColor: 'rgba(0, 0, 0, 0.3)',
                zIndex: 304,
                cursor: 'default',
              }}
            />
          ) : null}

          <div
            className="fixed top-0 right-0 bottom-0 flex flex-col bg-white shadow-xl"
            style={{
              width: '100vw',
              maxWidth: '600px',
              height: '100vh',
              zIndex: 305,
              transform:
                addFormSlideIn && !addFormPanel.isMinimized
                  ? 'translateX(0)'
                  : 'translateX(100%)',
              transition: 'transform 0.2s ease',
              pointerEvents: addFormPanel.isMinimized ? 'none' : 'auto',
            }}
          >
            <header
              className="flex shrink-0 items-center justify-between"
              style={{
                backgroundColor: NAVY,
                padding: '12px 16px',
              }}
            >
              <h2
                style={{
                  fontSize: '16px',
                  fontWeight: 600,
                  color: '#ffffff',
                }}
              >
                Add New Staff
              </h2>
              <PanelHeaderActions
                variant="dark"
                onMinimize={() => addFormPanel.minimize()}
                onClose={() => setShowAddFormConfirmClose(true)}
                replaceActions={
                  showAddFormConfirmClose ? (
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        onClick={handleCloseAddForm}
                        className="border-none bg-transparent p-0"
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#EF4444',
                          cursor: 'pointer',
                        }}
                      >
                        Discard
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowAddFormConfirmClose(false)}
                        className="border-none bg-transparent p-0"
                        style={{
                          fontSize: '12px',
                          fontWeight: 500,
                          color: '#9CA3AF',
                          cursor: 'pointer',
                        }}
                      >
                        Keep editing
                      </button>
                    </div>
                  ) : undefined
                }
              />
            </header>

            <form
              onSubmit={(event) => void handleAddStaff(event)}
              className="min-h-0 flex-1 overflow-y-auto"
              style={{ padding: '16px' }}
            >
              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="staff-legal-name" style={fieldLabelStyle}>
                  Legal Name (required)
                </label>
                <input
                  id="staff-legal-name"
                  type="text"
                  value={legalName}
                  onChange={(event) => setLegalName(event.target.value)}
                  placeholder="Full legal name"
                  style={fieldInputStyle}
                />
                {formErrors.legalName ? (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#EF4444',
                      marginTop: '4px',
                    }}
                  >
                    {formErrors.legalName}
                  </p>
                ) : null}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="staff-phone" style={fieldLabelStyle}>
                  Phone Number (required)
                </label>
                <input
                  id="staff-phone"
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+1 (XXX) XXX-XXXX"
                  style={fieldInputStyle}
                />
                {formErrors.phone ? (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#EF4444',
                      marginTop: '4px',
                    }}
                  >
                    {formErrors.phone}
                  </p>
                ) : null}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label htmlFor="staff-primary-role" style={fieldLabelStyle}>
                  Primary Role (required)
                </label>
                <select
                  id="staff-primary-role"
                  value={primaryRole}
                  onChange={(event) => {
                    setPrimaryRole(event.target.value)
                    setSecondaryRoles((previous) =>
                      previous.filter((role) => role !== event.target.value),
                    )
                  }}
                  style={fieldInputStyle}
                >
                  {ROLE_OPTIONS.map((role) => (
                    <option key={role} value={role}>
                      {role}
                    </option>
                  ))}
                </select>
                {primaryRole === 'Custom' ? (
                  <input
                    type="text"
                    value={customPrimaryRole}
                    onChange={(event) =>
                      setCustomPrimaryRole(event.target.value)
                    }
                    placeholder="Custom role name"
                    style={{ ...fieldInputStyle, marginTop: '8px' }}
                  />
                ) : null}
                {formErrors.primaryRole ? (
                  <p
                    style={{
                      fontSize: '12px',
                      color: '#EF4444',
                      marginTop: '4px',
                    }}
                  >
                    {formErrors.primaryRole}
                  </p>
                ) : null}
              </div>

              <div style={{ marginBottom: '16px' }}>
                <span style={fieldLabelStyle}>Secondary Role(s)</span>
                <div
                  className="flex flex-col"
                  style={{ gap: '8px', marginTop: '4px' }}
                >
                  {availableSecondaryRoles.map((role) => (
                    <label
                      key={role}
                      className="flex items-center gap-2"
                      style={{ fontSize: '13px', color: '#374151' }}
                    >
                      <input
                        type="checkbox"
                        checked={secondaryRoles.includes(role)}
                        onChange={() => handleToggleSecondaryRole(role)}
                      />
                      {role}
                    </label>
                  ))}
                </div>
              </div>

              <ExperienceRatingSelector
                value={experienceRating}
                onChange={setExperienceRating}
                error={formErrors.experienceRating}
              />

              {formSubmitError ? (
                <p
                  style={{
                    fontSize: '12px',
                    color: '#EF4444',
                    marginBottom: '12px',
                  }}
                >
                  {formSubmitError}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={isSaving}
                style={{
                  width: '100%',
                  backgroundColor: NAVY,
                  color: '#ffffff',
                  borderRadius: '6px',
                  padding: '10px',
                  fontSize: '14px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: isSaving ? 'default' : 'pointer',
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                Add Staff Member
              </button>
              <button
                type="button"
                onClick={() => setShowAddFormConfirmClose(true)}
                className="mt-3 w-full hover:underline"
                style={{
                  fontSize: '13px',
                  color: '#6B7280',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
            </form>
          </div>
        </>
      ) : null}
    </>
  )
}

function StaffProfileDuplicateNotice({
  label,
  onRestore,
}: {
  label: string
  onRestore: () => void
}) {
  return (
    <div
      role="status"
      style={{
        position: 'fixed',
        top: '16px',
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 2000,
        backgroundColor: NAVY,
        color: '#ffffff',
        fontSize: '13px',
        fontWeight: 500,
        padding: '10px 16px',
        borderRadius: '6px',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
        display: 'flex',
        alignItems: 'center',
        gap: '12px',
        whiteSpace: 'nowrap',
      }}
    >
      <span>{label} is already open.</span>
      <button
        type="button"
        onClick={onRestore}
        className="border-none bg-transparent p-0 underline"
        style={{
          color: '#ffffff',
          fontSize: '13px',
          fontWeight: 600,
          cursor: 'pointer',
        }}
      >
        Restore
      </button>
    </div>
  )
}

export default StaffManagementPage
