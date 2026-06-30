import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { IconBell, IconChevronDown, IconChevronRight } from '@tabler/icons-react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

const CERTIFICATION_TYPES = [
  'Food Handler Card',
  'ServSafe — Food',
  'ServSafe — Alcohol',
  'TIPS',
  'TIPS On Premise',
  'RAMP',
  'Liquor Tax Badge',
  'Custom',
] as const

const ALCOHOL_CERT_TYPES = new Set([
  'TIPS',
  'TIPS On Premise',
  'RAMP',
  'ServSafe — Alcohol',
])

const OVERRIDE_REASON_OPTIONS = [
  'Staff does not serve alcohol',
  'Certification on file elsewhere',
  'Exempted by management',
  'Other',
] as const

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

type CertificationType = (typeof CERTIFICATION_TYPES)[number]
type RequiredCourseStatus = 'not_started' | 'in_progress' | 'completed' | 'failed'

interface StaffRoleRow {
  role: string
  is_primary: boolean
}

export interface StaffProfileCertificationsStaff {
  phone: string
  legal_name?: string
  display_name?: string | null
  staff_roles: StaffRoleRow[] | null
}

interface StaffProfileCertificationsTabProps {
  staff: StaffProfileCertificationsStaff
  organizationId: string | null
  scrollTarget?: string | null
  onScrollTargetHandled?: () => void
  onComplianceRefresh?: () => void
}

interface StaffCertification {
  id: string
  cert_type: string
  cert_name: string | null
  issued_date: string | null
  expiry_date: string | null
  issued_state: string | null
  document_url: string | null
  is_verified: boolean
  is_alcohol_cert: boolean
  created_at: string
}

interface CourseTemplateRow {
  id: string
  name: string
  is_required_for_all: boolean
  required_roles: string[] | null
  assignment_type: string | null
}

interface CourseCompletionRow {
  id: string
  course_template_id: string
  started_at: string | null
  completed_at: string | null
  test_score_percent: number | null
  passed: boolean
  retake_count: number
  created_at: string
  assignment_type: string | null
}

interface RequiredCourse {
  templateId: string
  courseName: string
  status: RequiredCourseStatus
  assignmentLabel: string
}

interface CompletedCourse {
  id: string
  courseName: string
  completedAt: string
  testScorePercent: number | null
  passed: boolean
  retakeCount: number
  assignmentType: string | null
}

interface UploadFormState {
  certType: CertificationType
  customName: string
  isAlcoholCert: boolean
  issuedDate: string
  expirationDate: string
  issuedState: string
  documentUrl: string | null
  pendingFile: File | null
}

const EMPTY_UPLOAD_FORM: UploadFormState = {
  certType: 'Food Handler Card',
  customName: '',
  isAlcoholCert: false,
  issuedDate: '',
  expirationDate: '',
  issuedState: '',
  documentUrl: null,
  pendingFile: null,
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

function hasBartenderRole(roles: StaffRoleRow[] | null): boolean {
  return (roles ?? []).some(
    (role) => normalizeRoleKey(role.role) === 'bartender',
  )
}

function getStaffRoleKeys(roles: StaffRoleRow[] | null): string[] {
  return (roles ?? []).map((role) => normalizeRoleKey(role.role))
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function isValidAlcoholCert(cert: StaffCertification): boolean {
  if (!ALCOHOL_CERT_TYPES.has(cert.cert_type)) {
    return false
  }

  if (!cert.expiry_date) {
    return true
  }

  return cert.expiry_date >= todayIsoDate()
}

function satisfiesAlcoholCertRequirement(cert: StaffCertification): boolean {
  if (cert.is_alcohol_cert === true) {
    return true
  }

  const normalized = cert.cert_type.trim().toLowerCase()
  if (normalized === 'tips' || normalized === 'tips_override') {
    return true
  }

  return isValidAlcoholCert(cert)
}

function isCertExpired(expiryDate: string | null): boolean {
  if (!expiryDate) {
    return false
  }

  return expiryDate < todayIsoDate()
}

function isCertExpiringSoon(expiryDate: string | null): boolean {
  if (!expiryDate || isCertExpired(expiryDate)) {
    return false
  }

  const expiry = new Date(`${expiryDate}T12:00:00`)
  const today = new Date(`${todayIsoDate()}T12:00:00`)
  const thirtyDaysFromNow = new Date(today)
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30)

  return expiry <= thirtyDaysFromNow
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

function getCertDisplayName(cert: StaffCertification): string {
  if (cert.cert_type === 'tips_override') {
    return 'Alcohol Cert — Requirement Overridden'
  }

  if (cert.cert_type === 'Custom' && cert.cert_name?.trim()) {
    return cert.cert_name.trim()
  }

  return cert.cert_type
}

function templateAppliesToStaff(
  template: CourseTemplateRow,
  staffRoleKeys: string[],
): boolean {
  if (template.is_required_for_all) {
    return true
  }

  const requiredRoles = template.required_roles ?? []
  return requiredRoles.some((role) =>
    staffRoleKeys.includes(normalizeRoleKey(role)),
  )
}

function getAssignmentLabel(
  template: CourseTemplateRow,
  staffRoleKeys: string[],
): string {
  if (template.is_required_for_all) {
    return 'Required for all staff'
  }

  const matchedRole = (template.required_roles ?? []).find((role) =>
    staffRoleKeys.includes(normalizeRoleKey(role)),
  )

  if (matchedRole) {
    return `Required for ${formatRoleLabel(matchedRole)}`
  }

  if (template.assignment_type?.trim()) {
    return template.assignment_type.trim()
  }

  return 'Required course'
}

function getStaffFirstName(staff: {
  display_name?: string | null
  legal_name?: string
}): string {
  const displayName = staff.display_name?.trim()
  if (displayName) {
    return displayName.split(/\s+/)[0] ?? displayName
  }

  const legalName = staff.legal_name?.trim()
  if (legalName) {
    return legalName.split(/\s+/)[0] ?? legalName
  }

  return 'there'
}

function getPortalLink(): string {
  return `${window.location.origin}/staff/checkin`
}

function buildReminderSmsMessage(
  firstName: string,
  portalLink: string,
  certsOutstanding: boolean,
  coursesOutstanding: boolean,
): string | null {
  if (!certsOutstanding && !coursesOutstanding) {
    return null
  }

  if (certsOutstanding && coursesOutstanding) {
    return `Hi ${firstName}, you have certification(s) to upload and required course(s) to complete. Tap here to take care of both today: ${portalLink}`
  }

  if (certsOutstanding) {
    return `Hi ${firstName}, you have certification(s) that need your attention. Please take a moment to upload or renew them today: ${portalLink}`
  }

  return `Hi ${firstName}, you have required course(s) to complete. Please log in and finish them today: ${portalLink}`
}

function getRequiredCourseStatus(
  completion: CourseCompletionRow | undefined,
): RequiredCourseStatus {
  if (!completion) {
    return 'not_started'
  }

  if (completion.started_at && !completion.completed_at) {
    return 'in_progress'
  }

  if (completion.completed_at && completion.passed) {
    return 'completed'
  }

  if (completion.completed_at && !completion.passed) {
    return 'failed'
  }

  return 'not_started'
}

function getLatestCompletionByTemplate(
  completions: CourseCompletionRow[],
): Map<string, CourseCompletionRow> {
  const byTemplate = new Map<string, CourseCompletionRow>()

  for (const completion of completions) {
    const existing = byTemplate.get(completion.course_template_id)
    if (
      !existing ||
      new Date(completion.created_at).getTime() >
        new Date(existing.created_at).getTime()
    ) {
      byTemplate.set(completion.course_template_id, completion)
    }
  }

  return byTemplate
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
  const { colors } = useProductConfig()
  const styles = {
    red: { color: colors.brand_red, backgroundColor: '#FEE2E2' },
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
        ...styles,
      }}
    >
      {label}
    </span>
  )
}

export default function StaffProfileCertificationsTab({
  staff,
  organizationId,
  scrollTarget,
  onScrollTargetHandled,
  onComplianceRefresh,
}: StaffProfileCertificationsTabProps) {
  const { colors } = useProductConfig()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [certifications, setCertifications] = useState<StaffCertification[]>([])
  const [requiredCourses, setRequiredCourses] = useState<RequiredCourse[]>([])
  const [completedCourses, setCompletedCourses] = useState<CompletedCourse[]>([])
  const [completedCoursesExpanded, setCompletedCoursesExpanded] = useState(false)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [editingCertId, setEditingCertId] = useState<string | null>(null)
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD_FORM)
  const [isSavingCert, setIsSavingCert] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const [showOverrideForm, setShowOverrideForm] = useState(false)
  const [overrideReason, setOverrideReason] = useState<string>(
    OVERRIDE_REASON_OPTIONS[0],
  )
  const [overrideNotes, setOverrideNotes] = useState('')
  const [isSavingOverride, setIsSavingOverride] = useState(false)
  const [overrideError, setOverrideError] = useState<string | null>(null)
  const [coursesOutstanding, setCoursesOutstanding] = useState(false)
  const [reminderToastVisible, setReminderToastVisible] = useState(false)

  const fieldLabelStyle = {
    display: 'block' as const,
    fontSize: '12px',
    fontWeight: 500,
    color: colors.brand_navy,
    marginBottom: '6px',
  }

  const fieldInputStyle = {
    width: '100%',
    fontSize: '13px',
    color: colors.text_body,
    border: '1px solid #E5E7EB',
    borderRadius: '6px',
    padding: '8px 10px',
    backgroundColor: '#ffffff',
  }

  const outlineButtonStyle = {
    fontSize: '12px',
    fontWeight: 500,
    borderRadius: '6px',
    padding: '8px 12px',
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

  const smallOutlineButtonStyle = {
    ...outlineButtonStyle,
    fontSize: '11px',
    padding: '6px 10px',
    display: 'inline-flex',
    alignItems: 'center',
    gap: '6px',
  } as const

  const loadCertificationsData = useCallback(async () => {
    if (!organizationId) {
      setCertifications([])
      setRequiredCourses([])
      setCompletedCourses([])
      setCoursesOutstanding(false)
      setLoading(false)
      return
    }

    setLoading(true)

    const staffRoleKeys = getStaffRoleKeys(staff.staff_roles)

    const [certificationsResult, templatesResult, completionsResult] =
      await Promise.all([
        supabase
          .from('staff_certifications')
          .select(
            'id, cert_type, cert_name, issued_date, expiry_date, issued_state, document_url, is_verified, is_alcohol_cert, created_at',
          )
          .eq('organization_id', organizationId)
          .eq('staff_phone', staff.phone)
          .order('created_at', { ascending: false }),
        supabase
          .from('course_templates')
          .select(
            'id, course_name, is_required_for_all, required_roles, assignment_type',
          )
          .eq('organization_id', organizationId),
        supabase
          .from('course_completions')
          .select(
            'id, course_template_id, started_at, completed_at, test_score_percent, passed, retake_count, created_at, assignment_type',
          )
          .eq('organization_id', organizationId)
          .eq('staff_phone', staff.phone)
          .order('created_at', { ascending: false }),
      ])

    if (certificationsResult.error) {
      console.error(
        '[StaffProfileCertifications] load certifications failed',
        certificationsResult.error,
      )
      setCertifications([])
    } else {
      setCertifications(
        (certificationsResult.data ?? []).map((row) => ({
          id: row.id as string,
          cert_type:
            typeof row.cert_type === 'string' ? row.cert_type : 'Custom',
          cert_name:
            typeof row.cert_name === 'string' ? row.cert_name : null,
          issued_date:
            typeof row.issued_date === 'string' ? row.issued_date : null,
          expiry_date:
            typeof row.expiry_date === 'string' ? row.expiry_date : null,
          issued_state:
            typeof row.issued_state === 'string' ? row.issued_state : null,
          document_url:
            typeof row.document_url === 'string' ? row.document_url : null,
          is_verified: Boolean(row.is_verified),
          is_alcohol_cert: Boolean(row.is_alcohol_cert),
          created_at:
            typeof row.created_at === 'string'
              ? row.created_at
              : new Date().toISOString(),
        })),
      )
    }

    const templates: CourseTemplateRow[] = (templatesResult.data ?? []).map(
      (row) => ({
        id: row.id as string,
        name: typeof row.course_name === 'string' ? row.course_name : 'Course',
        is_required_for_all: Boolean(row.is_required_for_all),
        required_roles: Array.isArray(row.required_roles)
          ? row.required_roles.filter(
              (role): role is string => typeof role === 'string',
            )
          : null,
        assignment_type:
          typeof row.assignment_type === 'string'
            ? row.assignment_type
            : null,
      }),
    )

    const completions: CourseCompletionRow[] = (completionsResult.data ?? []).map(
      (row) => ({
        id: row.id as string,
        course_template_id:
          typeof row.course_template_id === 'string'
            ? row.course_template_id
            : '',
        started_at:
          typeof row.started_at === 'string' ? row.started_at : null,
        completed_at:
          typeof row.completed_at === 'string' ? row.completed_at : null,
        test_score_percent:
          typeof row.test_score_percent === 'number'
            ? row.test_score_percent
            : null,
        passed: Boolean(row.passed),
        retake_count:
          typeof row.retake_count === 'number' ? row.retake_count : 0,
        created_at:
          typeof row.created_at === 'string'
            ? row.created_at
            : new Date().toISOString(),
        assignment_type:
          typeof row.assignment_type === 'string'
            ? row.assignment_type
            : null,
      }),
    )

    if (templatesResult.error) {
      console.error(
        '[StaffProfileCertifications] load course templates failed',
        templatesResult.error,
      )
    }

    if (completionsResult.error) {
      console.error(
        '[StaffProfileCertifications] load course completions failed',
        completionsResult.error,
      )
    }

    const templatesById = new Map(templates.map((template) => [template.id, template]))
    const latestCompletionByTemplate = getLatestCompletionByTemplate(completions)

    const applicableTemplates = templates.filter((template) =>
      templateAppliesToStaff(template, staffRoleKeys),
    )

    setRequiredCourses(
      applicableTemplates.map((template) => ({
        templateId: template.id,
        courseName: template.name,
        status: getRequiredCourseStatus(
          latestCompletionByTemplate.get(template.id),
        ),
        assignmentLabel: getAssignmentLabel(template, staffRoleKeys),
      })),
    )

    const completedRows = completions
      .filter((row) => row.completed_at)
      .sort(
        (left, right) =>
          new Date(right.completed_at ?? 0).getTime() -
          new Date(left.completed_at ?? 0).getTime(),
      )

    setCompletedCourses(
      completedRows.map((row) => {
        const template = templatesById.get(row.course_template_id)
        return {
          id: row.id,
          courseName: template?.name ?? 'Course',
          completedAt: row.completed_at ?? row.created_at,
          testScorePercent: row.test_score_percent,
          passed: row.passed,
          retakeCount: row.retake_count,
          assignmentType:
            row.assignment_type ?? template?.assignment_type ?? null,
        }
      }),
    )

    setCoursesOutstanding(completions.some((row) => !row.completed_at))

    setLoading(false)
    onComplianceRefresh?.()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- staff.staff_roles read via closure; unstable array ref must not trigger reload
  }, [organizationId, staff.phone, onComplianceRefresh])

  useEffect(() => {
    void loadCertificationsData()
  }, [loadCertificationsData])

  useEffect(() => {
    if (!scrollTarget || loading) {
      return
    }

    const frame = requestAnimationFrame(() => {
      const target = document.querySelector(
        `[data-compliance-scroll="${scrollTarget}"]`,
      )
      if (target instanceof HTMLElement) {
        target.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }
      onScrollTargetHandled?.()
    })

    return () => {
      cancelAnimationFrame(frame)
    }
  }, [loading, onScrollTargetHandled, scrollTarget])

  useEffect(() => {
    if (!toastMessage) {
      return
    }

    const timer = window.setTimeout(() => {
      setToastMessage(null)
    }, 3000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [toastMessage])

  useEffect(() => {
    if (!reminderToastVisible) {
      return
    }

    const timer = window.setTimeout(() => {
      setReminderToastVisible(false)
    }, 3000)

    return () => {
      window.clearTimeout(timer)
    }
  }, [reminderToastVisible])

  const certsOutstanding = useMemo(() => {
    const alcoholOutstanding =
      hasBartenderRole(staff.staff_roles) &&
      !certifications.some(satisfiesAlcoholCertRequirement)

    const expiringOrExpired = certifications.some(
      (cert) =>
        cert.expiry_date &&
        (isCertExpired(cert.expiry_date) || isCertExpiringSoon(cert.expiry_date)),
    )

    return alcoholOutstanding || expiringOrExpired
  }, [certifications, staff.staff_roles])

  const hasReminderOutstanding = certsOutstanding || coursesOutstanding

  const reminderMessage = useMemo(
    () =>
      buildReminderSmsMessage(
        getStaffFirstName(staff),
        getPortalLink(),
        certsOutstanding,
        coursesOutstanding,
      ),
    [certsOutstanding, coursesOutstanding, staff],
  )

  const handleSendReminder = () => {
    if (!hasReminderOutstanding || !reminderMessage) {
      return
    }

    console.log('[SMS QUEUED]', {
      to: staff.phone,
      message: reminderMessage,
    })
    setReminderToastVisible(true)
  }

  const showBartenderBanner =
    hasBartenderRole(staff.staff_roles) &&
    !certifications.some(satisfiesAlcoholCertRequirement) &&
    !bannerDismissed

  const resetOverrideForm = () => {
    setShowOverrideForm(false)
    setOverrideReason(OVERRIDE_REASON_OPTIONS[0])
    setOverrideNotes('')
    setOverrideError(null)
  }

  const handleConfirmOverride = async () => {
    if (!organizationId) {
      return
    }

    setIsSavingOverride(true)
    setOverrideError(null)

    const coordinatorNotes = `Reason: ${overrideReason}. Notes: ${overrideNotes.trim()}`

    const { error: insertError } = await supabase
      .from('staff_certifications')
      .insert({
        organization_id: organizationId,
        staff_phone: staff.phone,
        cert_type: 'tips_override',
        cert_name: 'Requirement override',
        issued_date: todayIsoDate(),
        coordinator_notes: coordinatorNotes,
      })

    if (insertError) {
      console.error(
        '[StaffProfileCertifications] override insert failed',
        insertError,
      )
      setOverrideError('Failed to save override — please try again.')
      setIsSavingOverride(false)
      return
    }

    const { error: deleteError } = await supabase
      .from('action_items')
      .delete()
      .eq('organization_id', organizationId)
      .eq('entity_id', staff.phone)
      .eq('category', 'staff_compliance')

    if (deleteError) {
      console.error(
        '[StaffProfileCertifications] delete action item failed',
        deleteError,
      )
    }

    resetOverrideForm()
    setIsSavingOverride(false)
    void loadCertificationsData()
  }

  const resetUploadForm = () => {
    setUploadForm(EMPTY_UPLOAD_FORM)
    setEditingCertId(null)
    setFormError(null)
    setShowUploadForm(false)
    if (fileInputRef.current) {
      fileInputRef.current.value = ''
    }
  }

  const openUploadForm = (cert?: StaffCertification) => {
    if (cert) {
      setEditingCertId(cert.id)
      setUploadForm({
        certType: CERTIFICATION_TYPES.includes(cert.cert_type as CertificationType)
          ? (cert.cert_type as CertificationType)
          : 'Custom',
        customName: cert.cert_name ?? '',
        isAlcoholCert: cert.is_alcohol_cert,
        issuedDate: cert.issued_date?.slice(0, 10) ?? '',
        expirationDate: cert.expiry_date?.slice(0, 10) ?? '',
        issuedState: cert.issued_state ?? '',
        documentUrl: cert.document_url,
        pendingFile: null,
      })
    } else {
      setEditingCertId(null)
      setUploadForm(EMPTY_UPLOAD_FORM)
    }

    setFormError(null)
    setShowUploadForm(true)
  }

  const uploadCertificationFile = async (file: File): Promise<string | null> => {
    if (!organizationId) {
      return null
    }

    const filePath = `${organizationId}/${staff.phone}/${Date.now()}-${file.name}`
    const { error } = await supabase.storage
      .from('staff-certifications')
      .upload(filePath, file)

    if (error) {
      console.error('[StaffProfileCertifications] file upload failed', error)
      return null
    }

    const { data } = supabase.storage
      .from('staff-certifications')
      .getPublicUrl(filePath)

    return data.publicUrl
  }

  const handleSaveCertification = async () => {
    if (!organizationId) {
      return
    }

    if (uploadForm.certType === 'Custom' && !uploadForm.customName.trim()) {
      setFormError('Enter a certification name.')
      return
    }

    if (!editingCertId && !uploadForm.pendingFile && !uploadForm.documentUrl) {
      setFormError('Upload a certificate document.')
      return
    }

    setIsSavingCert(true)
    setFormError(null)

    let documentUrl = uploadForm.documentUrl
    if (uploadForm.pendingFile) {
      const uploadedUrl = await uploadCertificationFile(uploadForm.pendingFile)
      if (!uploadedUrl) {
        setFormError('Failed to upload certificate document.')
        setIsSavingCert(false)
        return
      }
      documentUrl = uploadedUrl
    }

    const payload = {
      organization_id: organizationId,
      staff_phone: staff.phone,
      cert_type: uploadForm.certType,
      cert_name:
        uploadForm.certType === 'Custom'
          ? uploadForm.customName.trim().slice(0, 60)
          : null,
      issued_date: uploadForm.issuedDate || null,
      expiry_date: uploadForm.expirationDate || null,
      issued_state: uploadForm.issuedState.trim().slice(0, 2) || null,
      document_url: documentUrl,
      is_alcohol_cert:
        uploadForm.certType === 'Custom' ? uploadForm.isAlcoholCert : false,
    }

    const { error } = editingCertId
      ? await supabase
          .from('staff_certifications')
          .update(payload)
          .eq('id', editingCertId)
          .eq('organization_id', organizationId)
      : await supabase.from('staff_certifications').insert(payload)

    if (error) {
      console.error('[StaffProfileCertifications] save certification failed', error)
      setFormError('Failed to save certification — please try again.')
      setIsSavingCert(false)
      return
    }

    resetUploadForm()
    setIsSavingCert(false)
    void loadCertificationsData()
  }

  const getRequiredStatusBadge = (status: RequiredCourseStatus) => {
    switch (status) {
      case 'not_started':
        return <StatusBadge label="Not Started" tone="red" />
      case 'in_progress':
        return <StatusBadge label="In Progress" tone="amber" />
      case 'completed':
        return <StatusBadge label="Completed" tone="green" />
      case 'failed':
        return <StatusBadge label="Failed" tone="red" />
    }
  }

  const getRequiredCourseAction = (status: RequiredCourseStatus) => {
    if (status === 'completed') {
      return null
    }

    const label =
      status === 'not_started'
        ? 'Start'
        : status === 'in_progress'
          ? 'Continue'
          : 'Retake'

    return (
      <button
        type="button"
        onClick={() => setToastMessage('Coming soon')}
        style={outlineButtonStyle}
      >
        {label}
      </button>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center py-16">
        <div
          className="size-8 animate-spin rounded-full border-4 border-brand-navy border-t-transparent"
          role="status"
          aria-label="Loading certifications"
        />
      </div>
    )
  }

  return (
    <div
      className="relative min-h-0 flex-1 overflow-y-auto"
      style={{ padding: '16px', backgroundColor: '#ffffff' }}
    >
      {showBartenderBanner ? (
        <div className="mb-4">
          <div
            data-compliance-scroll="compliance-banner"
            className="flex items-start justify-between gap-3"
            style={{
              backgroundColor: '#FEF3C7',
              border: '1px solid #F59E0B',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <p style={{ fontSize: '13px', color: '#92400E', lineHeight: 1.4 }}>
              This staff member is scheduled as a bartender but has no valid
              alcohol service certification on file.
            </p>
            <button
              type="button"
              onClick={() => setBannerDismissed(true)}
              className="shrink-0 border-none bg-transparent p-0 hover:opacity-80"
              style={{
                fontSize: '12px',
                fontWeight: 500,
                color: colors.brand_navy,
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Acknowledge
            </button>
          </div>

          {!showOverrideForm ? (
            <button
              type="button"
              onClick={() => setShowOverrideForm(true)}
              className="mt-2 border-none bg-transparent p-0 hover:opacity-80"
              style={{
                fontSize: '13px',
                color: '#1B3A5C',
                cursor: 'pointer',
                textDecoration: 'underline',
              }}
            >
              Override requirement
            </button>
          ) : (
            <div
              className="mt-2 flex flex-col"
              style={{
                gap: '10px',
                border: '1px solid #E5E7EB',
                borderRadius: '8px',
                padding: '12px',
              }}
            >
              <div>
                <label htmlFor="override-reason" style={fieldLabelStyle}>
                  Reason
                </label>
                <select
                  id="override-reason"
                  value={overrideReason}
                  onChange={(event) => setOverrideReason(event.target.value)}
                  style={fieldInputStyle}
                >
                  {OVERRIDE_REASON_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="override-notes" style={fieldLabelStyle}>
                  Notes
                </label>
                <textarea
                  id="override-notes"
                  value={overrideNotes}
                  onChange={(event) => setOverrideNotes(event.target.value)}
                  placeholder="Add a note..."
                  rows={3}
                  style={{
                    ...fieldInputStyle,
                    resize: 'vertical' as const,
                  }}
                />
              </div>
              {overrideError ? (
                <p style={{ fontSize: '12px', color: '#EF4444' }}>{overrideError}</p>
              ) : null}
              <div className="flex items-center" style={{ gap: '12px' }}>
                <button
                  type="button"
                  onClick={() => void handleConfirmOverride()}
                  disabled={isSavingOverride}
                  style={{
                    ...solidButtonStyle,
                    opacity: isSavingOverride ? 0.7 : 1,
                  }}
                >
                  Confirm Override
                </button>
                <button
                  type="button"
                  onClick={resetOverrideForm}
                  disabled={isSavingOverride}
                  className="border-none bg-transparent p-0 hover:underline"
                  style={{
                    fontSize: '12px',
                    color: '#6B7280',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      <section style={{ marginBottom: '24px' }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionHeading>Certifications</SectionHeading>
          <div className="flex items-center" style={{ gap: '8px' }}>
            <button
              type="button"
              onClick={handleSendReminder}
              disabled={!hasReminderOutstanding}
              title={
                hasReminderOutstanding
                  ? undefined
                  : 'Nothing outstanding to remind about.'
              }
              style={{
                ...smallOutlineButtonStyle,
                opacity: hasReminderOutstanding ? 1 : 0.4,
                cursor: hasReminderOutstanding ? 'pointer' : 'not-allowed',
              }}
            >
              <IconBell size={14} stroke={1.75} />
              Send Reminder
            </button>
            <button
              type="button"
              onClick={() => openUploadForm()}
              style={outlineButtonStyle}
            >
              Upload Certification
            </button>
          </div>
        </div>

        {reminderToastVisible ? (
          <p
            style={{
              fontSize: '12px',
              color: '#6B7280',
              marginTop: '-4px',
              marginBottom: '10px',
            }}
          >
            Reminder SMS queued — will send when messaging is live.
          </p>
        ) : null}

        {showUploadForm ? (
          <div
            className="mb-4 flex flex-col"
            style={{
              gap: '12px',
              border: '1px solid #E5E7EB',
              borderRadius: '8px',
              padding: '12px',
            }}
          >
            <div>
              <label htmlFor="cert-type" style={fieldLabelStyle}>
                Certification Type
              </label>
              <select
                id="cert-type"
                value={uploadForm.certType}
                onChange={(event) => {
                  const nextCertType = event.target.value as CertificationType
                  setUploadForm((previous) => ({
                    ...previous,
                    certType: nextCertType,
                    isAlcoholCert:
                      nextCertType === 'Custom' ? previous.isAlcoholCert : false,
                  }))
                }}
                style={fieldInputStyle}
              >
                {CERTIFICATION_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {type}
                  </option>
                ))}
              </select>
            </div>

            {uploadForm.certType === 'Custom' ? (
              <div>
                <label htmlFor="cert-custom-name" style={fieldLabelStyle}>
                  Certification Name
                </label>
                <input
                  id="cert-custom-name"
                  type="text"
                  value={uploadForm.customName}
                  maxLength={60}
                  onChange={(event) =>
                    setUploadForm((previous) => ({
                      ...previous,
                      customName: event.target.value,
                    }))
                  }
                  style={fieldInputStyle}
                />
              </div>
            ) : null}

            {uploadForm.certType === 'Custom' ? (
              <label
                htmlFor="cert-is-alcohol"
                className="flex items-center gap-2"
                style={{ fontSize: '13px', color: '#374151', cursor: 'pointer' }}
              >
                <input
                  id="cert-is-alcohol"
                  type="checkbox"
                  checked={uploadForm.isAlcoholCert}
                  onChange={(event) =>
                    setUploadForm((previous) => ({
                      ...previous,
                      isAlcoholCert: event.target.checked,
                    }))
                  }
                />
                This certifies alcohol service (satisfies bartender requirement)
              </label>
            ) : null}

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="cert-issued-date" style={fieldLabelStyle}>
                  Issued Date
                </label>
                <input
                  id="cert-issued-date"
                  type="date"
                  value={uploadForm.issuedDate}
                  onChange={(event) =>
                    setUploadForm((previous) => ({
                      ...previous,
                      issuedDate: event.target.value,
                    }))
                  }
                  style={fieldInputStyle}
                />
              </div>
              <div>
                <label htmlFor="cert-expiration-date" style={fieldLabelStyle}>
                  Expiration Date
                </label>
                <input
                  id="cert-expiration-date"
                  type="date"
                  value={uploadForm.expirationDate}
                  onChange={(event) =>
                    setUploadForm((previous) => ({
                      ...previous,
                      expirationDate: event.target.value,
                    }))
                  }
                  style={fieldInputStyle}
                />
              </div>
            </div>

            <div>
              <label htmlFor="cert-issued-state" style={fieldLabelStyle}>
                Issued State
              </label>
              <input
                id="cert-issued-state"
                type="text"
                value={uploadForm.issuedState}
                maxLength={2}
                onChange={(event) =>
                  setUploadForm((previous) => ({
                    ...previous,
                    issuedState: event.target.value.toUpperCase(),
                  }))
                }
                style={fieldInputStyle}
              />
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null
                  setUploadForm((previous) => ({
                    ...previous,
                    pendingFile: file,
                  }))
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                style={outlineButtonStyle}
              >
                Upload Certificate Document
              </button>
              {uploadForm.pendingFile ? (
                <p
                  className="mt-1"
                  style={{ fontSize: '12px', color: colors.text_muted }}
                >
                  {uploadForm.pendingFile.name}
                </p>
              ) : null}
            </div>

            {formError ? (
              <p style={{ fontSize: '12px', color: colors.brand_red }}>
                {formError}
              </p>
            ) : null}

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void handleSaveCertification()}
                disabled={isSavingCert}
                style={{
                  ...solidButtonStyle,
                  opacity: isSavingCert ? 0.7 : 1,
                }}
              >
                Save
              </button>
              <button
                type="button"
                onClick={resetUploadForm}
                disabled={isSavingCert}
                style={outlineButtonStyle}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : null}

        {certifications.length === 0 ? (
          <p
            style={{
              fontSize: '13px',
              fontStyle: 'italic',
              color: colors.text_muted,
            }}
          >
            No certifications on file
          </p>
        ) : (
          <div className="flex flex-col" style={{ gap: '10px' }}>
            {certifications.map((cert) => (
              <div
                key={cert.id}
                data-compliance-scroll={`cert-${cert.id}`}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p
                      style={{
                        fontSize: '14px',
                        fontWeight: 600,
                        color: colors.brand_navy,
                      }}
                    >
                      {getCertDisplayName(cert)}
                    </p>
                    {cert.issued_date ? (
                      <p
                        className="mt-1"
                        style={{ fontSize: '12px', color: colors.text_muted }}
                      >
                        Issued {formatDisplayDate(cert.issued_date)}
                      </p>
                    ) : null}
                    {cert.expiry_date ? (
                      <p
                        style={{ fontSize: '12px', color: colors.text_muted }}
                      >
                        Expires {formatDisplayDate(cert.expiry_date)}
                      </p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      {isCertExpired(cert.expiry_date) ? (
                        <StatusBadge label="Expired" tone="red" />
                      ) : null}
                      {!isCertExpired(cert.expiry_date) &&
                      isCertExpiringSoon(cert.expiry_date) ? (
                        <StatusBadge label="Expiring Soon" tone="amber" />
                      ) : null}
                      {cert.is_verified ? (
                        <StatusBadge label="Verified" tone="green" />
                      ) : null}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {cert.document_url ? (
                      <a
                        href={cert.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={outlineButtonStyle}
                      >
                        View
                      </a>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => openUploadForm(cert)}
                      style={outlineButtonStyle}
                    >
                      Replace
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionHeading>Required Courses</SectionHeading>
        <div className="mb-3 flex justify-end">
          <button
            type="button"
            onClick={() => setToastMessage('Coming soon')}
            className="border-none bg-transparent p-0 hover:opacity-80"
            style={{
              fontSize: '13px',
              color: colors.brand_navy,
              textDecoration: 'underline',
              cursor: 'pointer',
            }}
          >
            Assign Course
          </button>
        </div>

        {requiredCourses.length === 0 ? (
          <p
            style={{
              fontSize: '13px',
              fontStyle: 'italic',
              color: colors.text_muted,
            }}
          >
            No required courses assigned
          </p>
        ) : (
          <div className="flex flex-col" style={{ gap: '10px' }}>
            {requiredCourses.map((course) => (
              <div
                key={course.templateId}
                data-compliance-scroll={`required-course-${course.templateId}`}
                style={{
                  border: '1px solid #E5E7EB',
                  borderRadius: '8px',
                  padding: '12px',
                }}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p
                        style={{
                          fontSize: '14px',
                          fontWeight: 600,
                          color: colors.brand_navy,
                        }}
                      >
                        {course.courseName}
                      </p>
                      {getRequiredStatusBadge(course.status)}
                    </div>
                    <p
                      className="mt-1"
                      style={{ fontSize: '11px', color: colors.text_muted }}
                    >
                      {course.assignmentLabel}
                    </p>
                  </div>
                  {getRequiredCourseAction(course.status)}
                </div>
              </div>
            ))}
          </div>
        )}

        <div style={{ marginTop: '20px' }}>
          <button
            type="button"
            onClick={() => setCompletedCoursesExpanded((current) => !current)}
            className="flex w-full items-center gap-2 border-none bg-transparent p-0"
            style={{
              fontSize: '13px',
              fontWeight: 600,
              color: colors.brand_navy,
              cursor: 'pointer',
              textAlign: 'left',
            }}
          >
            {completedCoursesExpanded ? (
              <IconChevronDown size={16} stroke={2} />
            ) : (
              <IconChevronRight size={16} stroke={2} />
            )}
            Completed Courses ({completedCourses.length})
          </button>

          {completedCoursesExpanded ? (
            completedCourses.length === 0 ? (
              <p
                className="mt-3"
                style={{
                  fontSize: '13px',
                  fontStyle: 'italic',
                  color: colors.text_muted,
                }}
              >
                No courses completed yet
              </p>
            ) : (
              <div className="mt-3 flex flex-col" style={{ gap: '10px' }}>
                {completedCourses.map((course) => (
                  <div
                    key={course.id}
                    className="flex flex-col gap-1"
                    style={{
                      fontSize: '13px',
                      borderBottom: '1px solid #F3F4F6',
                      paddingBottom: '10px',
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                      <span style={{ color: colors.text_body, fontWeight: 500 }}>
                        {course.courseName}
                      </span>
                      <span style={{ color: colors.text_muted }}>
                        {formatDisplayDate(course.completedAt)}
                      </span>
                      {course.testScorePercent != null ? (
                        <span style={{ color: colors.text_muted }}>
                          {course.testScorePercent}%
                        </span>
                      ) : null}
                      <StatusBadge
                        label={course.passed ? 'Passed' : 'Failed'}
                        tone={course.passed ? 'green' : 'red'}
                      />
                      {course.retakeCount > 0 ? (
                        <span style={{ fontSize: '11px', color: colors.text_muted }}>
                          Retaken {course.retakeCount} time
                          {course.retakeCount === 1 ? '' : 's'}
                        </span>
                      ) : null}
                    </div>
                    {course.assignmentType ? (
                      <span style={{ fontSize: '11px', color: colors.text_muted }}>
                        {course.assignmentType}
                      </span>
                    ) : null}
                  </div>
                ))}
              </div>
            )
          ) : null}
        </div>
      </section>

      {toastMessage ? (
        <div
          role="status"
          style={{
            position: 'absolute',
            left: '16px',
            right: '16px',
            bottom: '16px',
            backgroundColor: colors.brand_navy,
            color: colors.white,
            borderRadius: '6px',
            padding: '10px 12px',
            fontSize: '13px',
            zIndex: 2,
          }}
        >
          {toastMessage}
        </div>
      ) : null}
    </div>
  )
}
