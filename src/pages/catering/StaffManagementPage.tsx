import {
  type CSSProperties,
  type FormEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from 'react'
import {
  IconClock,
  IconSearch,
  IconUser,
  IconUsers,
  IconX,
} from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
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

type ExperienceRatingColumn = 'experience_rating' | 'starting_designation'
type StaffRolesPhoneColumn = 'staff_phone' | 'phone'

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
  seniority_level: number
  average_rating: number | null
  rating_count: number
  starting_designation: string | null
  status: StaffStatus
  is_priority: boolean
  created_at: string
  staff_roles: StaffRoleRow[] | null
}

interface StaffManagementPageProps {
  onClose: () => void
}

interface SlidePanelProps {
  isOpen: boolean
  onClose: () => void
  width: number
  zIndex: number
  children: ReactNode
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

function SlidePanel({
  isOpen,
  onClose,
  width,
  zIndex,
  children,
}: SlidePanelProps) {
  const [slideIn, setSlideIn] = useState(false)

  useEffect(() => {
    if (!isOpen) {
      setSlideIn(false)
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

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => {
      document.removeEventListener('keydown', handleKeyDown)
    }
  }, [isOpen, onClose])

  if (!isOpen) {
    return null
  }

  return (
    <>
      <button
        type="button"
        aria-label="Close panel"
        onClick={onClose}
        className="fixed inset-0 border-none"
        style={{
          backgroundColor: 'rgba(0, 0, 0, 0.3)',
          zIndex,
          cursor: 'default',
        }}
      />
      <div
        className="fixed top-0 right-0 bottom-0 flex flex-col bg-white shadow-xl"
        style={{
          width: '100vw',
          maxWidth: `${width}px`,
          height: '100vh',
          zIndex: zIndex + 1,
          transform: slideIn ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.2s ease',
        }}
      >
        {children}
      </div>
    </>
  )
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
  if (staff.display_name?.trim()) {
    return staff.display_name.trim()
  }
  const legal = staff.legal_name.trim()
  if (!legal) {
    return 'Unknown'
  }
  return legal.split(/\s+/)[0] ?? legal
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

async function resolveExperienceRatingColumn(): Promise<ExperienceRatingColumn> {
  const { error } = await supabase
    .from('staff')
    .select('experience_rating')
    .limit(0)

  if (error?.message?.includes('experience_rating')) {
    return 'starting_designation'
  }

  return 'experience_rating'
}

async function fetchStaffRolesColumnNames(): Promise<string[]> {
  const { data, error } = await supabase
    .schema('information_schema')
    .from('columns')
    .select('column_name')
    .eq('table_schema', 'public')
    .eq('table_name', 'staff_roles')

  if (!error && data) {
    return data
      .map((row) =>
        typeof row.column_name === 'string' ? row.column_name : '',
      )
      .filter(Boolean)
  }

  console.error(
    '[StaffManagement] staff_roles schema lookup failed',
    error,
  )
  return []
}

async function resolveStaffRolesPhoneColumn(): Promise<StaffRolesPhoneColumn> {
  const columnNames = await fetchStaffRolesColumnNames()

  if (columnNames.includes('staff_phone')) {
    return 'staff_phone'
  }
  if (columnNames.includes('phone')) {
    return 'phone'
  }

  const { error } = await supabase
    .from('staff_roles')
    .select('staff_phone')
    .limit(0)

  if (error?.message?.includes('staff_phone')) {
    return 'phone'
  }

  return 'staff_phone'
}

function buildStaffRoleInsertRow(
  organizationId: string,
  staffPhone: string,
  role: string,
  isPrimary: boolean,
  phoneColumn: StaffRolesPhoneColumn,
) {
  return {
    organization_id: organizationId,
    role,
    is_primary: isPrimary,
    [phoneColumn]: staffPhone,
  }
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

function formatStatusLabel(status: StaffStatus): string {
  if (status === 'not_active') {
    return 'Not Active'
  }
  if (status === 'alumni') {
    return 'Alumni'
  }
  return status.charAt(0).toUpperCase() + status.slice(1)
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

function StaffManagementPage({ onClose }: StaffManagementPageProps) {
  const [organizationId, setOrganizationId] = useState<string | null>(null)
  const [staffMembers, setStaffMembers] = useState<StaffMember[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [filterPill, setFilterPill] = useState<FilterPill>('all')
  const [sortBy, setSortBy] = useState<SortOption>('name')
  const [selectedStaff, setSelectedStaff] = useState<StaffMember | null>(null)
  const [profileTab, setProfileTab] = useState<ProfileTab>('history')
  const [showAddForm, setShowAddForm] = useState(false)
  const [successToast, setSuccessToast] = useState<string | null>(null)

  const [legalName, setLegalName] = useState('')
  const [phone, setPhone] = useState('')
  const [primaryRole, setPrimaryRole] = useState<string>(ROLE_OPTIONS[0])
  const [customPrimaryRole, setCustomPrimaryRole] = useState('')
  const [secondaryRoles, setSecondaryRoles] = useState<string[]>([])
  const [experienceRating, setExperienceRating] = useState(0)
  const [experienceRatingColumn, setExperienceRatingColumn] =
    useState<ExperienceRatingColumn>('starting_designation')
  const [staffRolesPhoneColumn, setStaffRolesPhoneColumn] =
    useState<StaffRolesPhoneColumn>('staff_phone')
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [formSubmitError, setFormSubmitError] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  const loadStaff = useCallback(async (orgId: string) => {
    setLoading(true)

    const { data, error } = await supabase
      .from('staff')
      .select(
        `
        phone,
        legal_name,
        display_name,
        photo_url,
        seniority_level,
        average_rating,
        rating_count,
        starting_designation,
        status,
        is_priority,
        created_at,
        staff_roles (
          role,
          is_primary
        )
      `,
      )
      .eq('organization_id', orgId)

    if (error) {
      console.error('[StaffManagement] load staff failed', error)
      setStaffMembers([])
    } else {
      setStaffMembers((data ?? []) as StaffMember[])
    }

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

      const [experienceColumn, rolesPhoneColumn] = await Promise.all([
        resolveExperienceRatingColumn(),
        resolveStaffRolesPhoneColumn(),
      ])
      setExperienceRatingColumn(experienceColumn)
      setStaffRolesPhoneColumn(rolesPhoneColumn)

      setOrganizationId(orgId.trim())
      await loadStaff(orgId.trim())
    }

    void init()
  }, [loadStaff])

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
    resetAddForm()
    setShowAddForm(true)
  }

  const handleCloseAddForm = () => {
    setShowAddForm(false)
    resetAddForm()
  }

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

      const nowIso = new Date().toISOString()
      const staffInsertPayload: Record<string, unknown> = {
        organization_id: organizationId,
        legal_name: trimmedLegalName,
        phone: e164Phone,
        status: 'active',
        is_priority: false,
        rating_count: 0,
        created_at: nowIso,
        updated_at: nowIso,
      }

      if (experienceRatingColumn === 'experience_rating') {
        staffInsertPayload.experience_rating = experienceRating
      } else {
        staffInsertPayload.starting_designation = String(experienceRating)
      }

      const { error: staffError } = await supabase
        .from('staff')
        .insert(staffInsertPayload)

      if (staffError) {
        console.error('[StaffManagement] staff insert failed', staffError)
        setFormSubmitError('Failed to add staff member — please try again.')
        return
      }

      const roleRows = [
        buildStaffRoleInsertRow(
          organizationId,
          e164Phone,
          resolvedPrimary,
          true,
          staffRolesPhoneColumn,
        ),
        ...secondaryRoles.map((role) =>
          buildStaffRoleInsertRow(
            organizationId,
            e164Phone,
            role,
            false,
            staffRolesPhoneColumn,
          ),
        ),
      ]

      const { error: rolesError } = await supabase
        .from('staff_roles')
        .insert(roleRows)

      if (rolesError) {
        console.error('[StaffManagement] staff_roles insert failed', rolesError)
        setFormSubmitError('Failed to add staff member — please try again.')
        return
      }

      console.log(`TODO: Send onboarding SMS to ${e164Phone} when Twilio is wired.`)
      setShowAddForm(false)
      resetAddForm()
      setSuccessToast(
        'Staff member added. SMS onboarding link will be sent when messaging is enabled.',
      )
      await loadStaff(organizationId)
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

  const profileTabs: { id: ProfileTab; label: string }[] = [
    { id: 'history', label: 'History' },
    { id: 'certifications', label: 'Certifications' },
    { id: 'availability', label: 'Availability' },
    { id: 'ai_summary', label: 'AI Summary' },
    { id: 'development', label: 'Development' },
    { id: 'personal_note', label: 'Personal Note' },
  ]

  return (
    <>
      <SlidePanel isOpen onClose={onClose} width={680} zIndex={300}>
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
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="rounded p-1 hover:bg-white/10"
              style={{ color: '#ffffff', border: 'none', background: 'none' }}
            >
              <IconX size={20} stroke={2} />
            </button>
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
                  onClick={() => {
                    setSelectedStaff(staff)
                    setProfileTab('history')
                  }}
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
                  <div
                    className="flex shrink-0 flex-col items-end"
                    style={{ gap: '4px' }}
                  >
                    <span
                      style={{
                        fontSize: '11px',
                        fontWeight: 500,
                        color: '#6B7280',
                      }}
                    >
                      S{staff.seniority_level}
                    </span>
                    {staff.rating_count > 0 &&
                    staff.average_rating != null ? (
                      <ReadOnlyStars rating={staff.average_rating} />
                    ) : (
                      <span
                        style={{
                          fontSize: '11px',
                          color: '#6B7280',
                          fontStyle: 'italic',
                        }}
                      >
                        {formatStartingDesignation(staff.starting_designation)}
                      </span>
                    )}
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
      </SlidePanel>

      <SlidePanel
        isOpen={selectedStaff !== null}
        onClose={() => setSelectedStaff(null)}
        width={600}
        zIndex={302}
      >
        {selectedStaff ? (
          <>
            <header style={{ backgroundColor: NAVY, padding: '16px' }}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 flex-1 items-start gap-3">
                  <div
                    style={{
                      border: '2px solid #ffffff',
                      borderRadius: '50%',
                      padding: 0,
                    }}
                  >
                    <StaffPhoto
                      photoUrl={selectedStaff.photo_url}
                      name={getStaffDisplayName(selectedStaff)}
                      size={64}
                    />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p
                      style={{
                        fontSize: '18px',
                        fontWeight: 700,
                        color: '#ffffff',
                      }}
                    >
                      {getStaffDisplayName(selectedStaff)}
                    </p>
                    <p
                      style={{
                        fontSize: '13px',
                        color: 'rgba(255,255,255,0.8)',
                        marginTop: '2px',
                      }}
                    >
                      {getPrimaryRole(selectedStaff)}
                    </p>
                    <p
                      style={{
                        fontSize: '11px',
                        color: 'rgba(255,255,255,0.7)',
                        marginTop: '2px',
                      }}
                    >
                      S{selectedStaff.seniority_level}
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {selectedStaff.rating_count > 0 &&
                      selectedStaff.average_rating != null ? (
                        <ReadOnlyStars
                          rating={selectedStaff.average_rating}
                          size={14}
                        />
                      ) : (
                        <span
                          style={{
                            fontSize: '11px',
                            color: 'rgba(255,255,255,0.8)',
                            fontStyle: 'italic',
                          }}
                        >
                          {formatStartingDesignation(
                            selectedStaff.starting_designation,
                          )}
                        </span>
                      )}
                      <span
                        style={{
                          ...statusBadgeStyle(selectedStaff.status),
                          fontSize: '11px',
                          fontWeight: 500,
                          borderRadius: '4px',
                          padding: '2px 8px',
                        }}
                      >
                        {formatStatusLabel(selectedStaff.status)}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedStaff(null)}
                  aria-label="Close profile"
                  className="rounded p-1 hover:bg-white/10"
                  style={{ color: '#ffffff', border: 'none', background: 'none' }}
                >
                  <IconX size={20} stroke={2} />
                </button>
              </div>
            </header>

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
                    onClick={() => setProfileTab(tab.id)}
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

            <div className="flex flex-1 flex-col items-center justify-center py-16">
              <IconClock size={32} color="#D1D5DB" stroke={1.5} />
              <p
                className="mt-3"
                style={{ fontSize: '13px', color: '#6B7280' }}
              >
                Coming soon
              </p>
            </div>
          </>
        ) : null}
      </SlidePanel>

      <SlidePanel
        isOpen={showAddForm}
        onClose={handleCloseAddForm}
        width={600}
        zIndex={304}
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
          <button
            type="button"
            onClick={handleCloseAddForm}
            aria-label="Close"
            className="rounded p-1 hover:bg-white/10"
            style={{ color: '#ffffff', border: 'none', background: 'none' }}
          >
            <IconX size={20} stroke={2} />
          </button>
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
              <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>
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
              <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>
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
                onChange={(event) => setCustomPrimaryRole(event.target.value)}
                placeholder="Custom role name"
                style={{ ...fieldInputStyle, marginTop: '8px' }}
              />
            ) : null}
            {formErrors.primaryRole ? (
              <p style={{ fontSize: '12px', color: '#EF4444', marginTop: '4px' }}>
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
            onClick={handleCloseAddForm}
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
      </SlidePanel>
    </>
  )
}

export default StaffManagementPage
