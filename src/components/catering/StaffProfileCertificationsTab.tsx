import { useCallback, useEffect, useRef, useState } from 'react'
import { useProductConfig } from '../../lib/hooks/useProductConfig'
import { supabase } from '../../lib/supabase'

const CERTIFICATION_TYPES = [
  'Food Handler Card',
  'ServSafe',
  'TIPS',
  'TIPS On Premise',
  'RAMP',
  'Liquor Tax Badge',
  'Custom',
] as const

const ALCOHOL_CERT_TYPES = new Set(['TIPS', 'TIPS On Premise', 'RAMP'])

type CertificationType = (typeof CERTIFICATION_TYPES)[number]

interface StaffRoleRow {
  role: string
  is_primary: boolean
}

export interface StaffProfileCertificationsStaff {
  phone: string
  staff_roles: StaffRoleRow[] | null
}

interface StaffProfileCertificationsTabProps {
  staff: StaffProfileCertificationsStaff
  organizationId: string | null
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
  created_at: string
}

interface CourseCompletion {
  id: string
  courseName: string
  completedAt: string
  testScorePercent: number | null
  passed: boolean
  retakeCount: number
}

interface UploadFormState {
  certType: CertificationType
  customName: string
  issuedDate: string
  expirationDate: string
  issuedState: string
  documentUrl: string | null
  pendingFile: File | null
}

const EMPTY_UPLOAD_FORM: UploadFormState = {
  certType: 'Food Handler Card',
  customName: '',
  issuedDate: '',
  expirationDate: '',
  issuedState: '',
  documentUrl: null,
  pendingFile: null,
}

function normalizeRoleKey(roleName: string): string {
  return roleName.trim().toLowerCase().replace(/\s+/g, '_')
}

function hasBartenderRole(roles: StaffRoleRow[] | null): boolean {
  return (roles ?? []).some(
    (role) => normalizeRoleKey(role.role) === 'bartender',
  )
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

function isCertExpired(expiryDate: string | null): boolean {
  if (!expiryDate) {
    return false
  }

  return expiryDate < todayIsoDate()
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
  if (cert.cert_type === 'Custom' && cert.cert_name?.trim()) {
    return cert.cert_name.trim()
  }

  return cert.cert_type
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

export default function StaffProfileCertificationsTab({
  staff,
  organizationId,
}: StaffProfileCertificationsTabProps) {
  const { colors } = useProductConfig()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [loading, setLoading] = useState(true)
  const [certifications, setCertifications] = useState<StaffCertification[]>([])
  const [courses, setCourses] = useState<CourseCompletion[]>([])
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [showUploadForm, setShowUploadForm] = useState(false)
  const [editingCertId, setEditingCertId] = useState<string | null>(null)
  const [uploadForm, setUploadForm] = useState<UploadFormState>(EMPTY_UPLOAD_FORM)
  const [isSavingCert, setIsSavingCert] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)

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

  const loadCertificationsData = useCallback(async () => {
    if (!organizationId) {
      setCertifications([])
      setCourses([])
      setLoading(false)
      return
    }

    setLoading(true)

    const [certificationsResult, coursesResult] = await Promise.all([
      supabase
        .from('staff_certifications')
        .select(
          'id, cert_type, cert_name, issued_date, expiry_date, issued_state, document_url, is_verified, created_at',
        )
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone)
        .order('created_at', { ascending: false }),
      supabase
        .from('course_completions')
        .select(
          'id, course_template_id, completed_at, test_score_percent, passed, retake_count',
        )
        .eq('organization_id', organizationId)
        .eq('staff_phone', staff.phone)
        .not('completed_at', 'is', null)
        .order('completed_at', { ascending: false }),
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
          created_at:
            typeof row.created_at === 'string'
              ? row.created_at
              : new Date().toISOString(),
        })),
      )
    }

    const courseRows = coursesResult.error ? [] : (coursesResult.data ?? [])
    if (coursesResult.error) {
      console.error(
        '[StaffProfileCertifications] load courses failed',
        coursesResult.error,
      )
    }

    const templateIds = [
      ...new Set(
        courseRows
          .map((row) => row.course_template_id)
          .filter((id): id is string => typeof id === 'string'),
      ),
    ]

    const templatesById = new Map<string, string>()
    if (templateIds.length > 0) {
      const { data: templates } = await supabase
        .from('course_templates')
        .select('id, name')
        .eq('organization_id', organizationId)
        .in('id', templateIds)

      for (const template of templates ?? []) {
        if (typeof template.id === 'string') {
          templatesById.set(
            template.id,
            typeof template.name === 'string' ? template.name : 'Course',
          )
        }
      }
    }

    setCourses(
      courseRows.map((row) => ({
        id: row.id as string,
        courseName:
          typeof row.course_template_id === 'string'
            ? (templatesById.get(row.course_template_id) ?? 'Course')
            : 'Course',
        completedAt:
          typeof row.completed_at === 'string'
            ? row.completed_at
            : new Date().toISOString(),
        testScorePercent:
          typeof row.test_score_percent === 'number'
            ? row.test_score_percent
            : null,
        passed: Boolean(row.passed),
        retakeCount:
          typeof row.retake_count === 'number' ? row.retake_count : 0,
      })),
    )

    setLoading(false)
  }, [organizationId, staff.phone])

  useEffect(() => {
    void loadCertificationsData()
  }, [loadCertificationsData])

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

  const showBartenderBanner =
    hasBartenderRole(staff.staff_roles) &&
    !certifications.some(isValidAlcoholCert) &&
    !bannerDismissed

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
        <div
          className="mb-4 flex items-start justify-between gap-3"
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
      ) : null}

      <section style={{ marginBottom: '24px' }}>
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionHeading>Certifications</SectionHeading>
          <button
            type="button"
            onClick={() => openUploadForm()}
            style={outlineButtonStyle}
          >
            Upload Certification
          </button>
        </div>

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
                onChange={(event) =>
                  setUploadForm((previous) => ({
                    ...previous,
                    certType: event.target.value as CertificationType,
                  }))
                }
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
                {uploadForm.pendingFile
                  ? uploadForm.pendingFile.name
                  : uploadForm.documentUrl
                    ? 'Replace Certificate Document'
                    : 'Upload Certificate Document'}
              </button>
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
                          Expired
                        </span>
                      ) : null}
                      {cert.is_verified ? (
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            color: '#166534',
                            backgroundColor: '#DCFCE7',
                            borderRadius: '4px',
                            padding: '2px 6px',
                          }}
                        >
                          Verified
                        </span>
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
        <div className="mb-3 flex items-center justify-between gap-3">
          <SectionHeading>Courses</SectionHeading>
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

        {courses.length === 0 ? (
          <p
            style={{
              fontSize: '13px',
              fontStyle: 'italic',
              color: colors.text_muted,
            }}
          >
            No courses completed yet
          </p>
        ) : (
          <div className="flex flex-col" style={{ gap: '10px' }}>
            {courses.map((course) => (
              <div
                key={course.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1"
                style={{
                  fontSize: '13px',
                  borderBottom: '1px solid #F3F4F6',
                  paddingBottom: '10px',
                }}
              >
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
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 600,
                    color: course.passed ? '#166534' : colors.brand_red,
                    backgroundColor: course.passed ? '#DCFCE7' : '#FEE2E2',
                    borderRadius: '4px',
                    padding: '2px 6px',
                  }}
                >
                  {course.passed ? 'Passed' : 'Failed'}
                </span>
                {course.retakeCount > 0 ? (
                  <span style={{ fontSize: '11px', color: colors.text_muted }}>
                    Retaken {course.retakeCount} time
                    {course.retakeCount === 1 ? '' : 's'}
                  </span>
                ) : null}
              </div>
            ))}
          </div>
        )}
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
