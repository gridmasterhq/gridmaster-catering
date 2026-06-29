import { supabase } from './supabase'
import { buildStaffProfileDeepLink } from './staffProfileNavigation'

const ALCOHOL_CERT_TYPES = new Set(['TIPS', 'TIPS On Premise', 'RAMP'])

export type StaffComplianceIssueType =
  | 'missing_alcohol_cert'
  | 'overdue_required_course'
  | 'cert_expiring_soon'
  | 'cert_expired'

export type StaffCompliancePriority = 'high' | 'normal'

export interface StaffRoleRow {
  role: string
  is_primary?: boolean
}

export interface StaffCertificationRow {
  id: string
  cert_type: string
  cert_name: string | null
  expiry_date: string | null
}

export interface CourseTemplateRow {
  id: string
  name: string
  is_required_for_all: boolean
  required_roles: string[] | null
}

export interface CourseCompletionRow {
  course_template_id: string
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface StaffComplianceIssue {
  type: StaffComplianceIssueType
  referenceKey: string
  scrollTarget: string
  alertLabel: string
  titleSuffix: string
  priority: StaffCompliancePriority
}

export interface StaffComplianceData {
  staffRoles: StaffRoleRow[]
  certifications: StaffCertificationRow[]
  courseTemplates: CourseTemplateRow[]
  courseCompletions: CourseCompletionRow[]
}

function normalizeRoleKey(roleName: string): string {
  return roleName.trim().toLowerCase().replace(/\s+/g, '_')
}

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function getStaffRoleKeys(roles: StaffRoleRow[]): string[] {
  return roles.map((role) => normalizeRoleKey(role.role))
}

function hasBartenderRole(roles: StaffRoleRow[]): boolean {
  return roles.some((role) => normalizeRoleKey(role.role) === 'bartender')
}

function isValidAlcoholCert(cert: StaffCertificationRow): boolean {
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

function getCertDisplayName(cert: StaffCertificationRow): string {
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

  return (template.required_roles ?? []).some((role) =>
    staffRoleKeys.includes(normalizeRoleKey(role)),
  )
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

function isRequiredCourseOverdue(
  completion: CourseCompletionRow | undefined,
): boolean {
  if (!completion) {
    return true
  }

  if (completion.completed_at) {
    return false
  }

  if (completion.started_at) {
    return false
  }

  const assignedAt = new Date(completion.created_at)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  return assignedAt <= sevenDaysAgo
}

export function detectStaffComplianceIssues(
  data: StaffComplianceData,
): StaffComplianceIssue[] {
  const issues: StaffComplianceIssue[] = []
  const staffRoleKeys = getStaffRoleKeys(data.staffRoles)

  if (
    hasBartenderRole(data.staffRoles) &&
    !data.certifications.some(isValidAlcoholCert)
  ) {
    issues.push({
      type: 'missing_alcohol_cert',
      referenceKey: '',
      scrollTarget: 'compliance-banner',
      alertLabel: '⚠ No alcohol cert on file',
      titleSuffix: 'No valid alcohol service cert on file',
      priority: 'high',
    })
  }

  const applicableTemplates = data.courseTemplates.filter((template) =>
    templateAppliesToStaff(template, staffRoleKeys),
  )
  const latestCompletionByTemplate = getLatestCompletionByTemplate(
    data.courseCompletions,
  )

  for (const template of applicableTemplates) {
    const completion = latestCompletionByTemplate.get(template.id)
    if (!isRequiredCourseOverdue(completion)) {
      continue
    }

    issues.push({
      type: 'overdue_required_course',
      referenceKey: template.id,
      scrollTarget: `required-course-${template.id}`,
      alertLabel: `⚠ Required course overdue: ${template.name}`,
      titleSuffix: `Required course overdue: ${template.name}`,
      priority: 'normal',
    })
  }

  for (const cert of data.certifications) {
    const certName = getCertDisplayName(cert)

    if (isCertExpired(cert.expiry_date)) {
      issues.push({
        type: 'cert_expired',
        referenceKey: cert.id,
        scrollTarget: `cert-${cert.id}`,
        alertLabel: `⚠ Cert expired: ${certName}`,
        titleSuffix: `Cert expired: ${certName}`,
        priority: 'high',
      })
      continue
    }

    if (isCertExpiringSoon(cert.expiry_date)) {
      issues.push({
        type: 'cert_expiring_soon',
        referenceKey: cert.id,
        scrollTarget: `cert-${cert.id}`,
        alertLabel: `⚠ Cert expiring soon: ${certName}`,
        titleSuffix: `Cert expiring soon: ${certName}`,
        priority: 'normal',
      })
    }
  }

  return issues
}

export async function loadStaffComplianceData(
  organizationId: string,
  staffPhone: string,
): Promise<StaffComplianceData> {
  const [rolesResult, certificationsResult, templatesResult, completionsResult] =
    await Promise.all([
      supabase
        .from('staff_roles')
        .select('role_name, is_primary')
        .eq('organization_id', organizationId)
        .eq('staff_phone', staffPhone),
      supabase
        .from('staff_certifications')
        .select('id, cert_type, cert_name, expiry_date')
        .eq('organization_id', organizationId)
        .eq('staff_phone', staffPhone),
      supabase
        .from('course_templates')
        .select('id, name, is_required_for_all, required_roles')
        .eq('organization_id', organizationId),
      supabase
        .from('course_completions')
        .select('course_template_id, started_at, completed_at, created_at')
        .eq('organization_id', organizationId)
        .eq('staff_phone', staffPhone),
    ])

  return {
    staffRoles: (rolesResult.data ?? []).map((row) => ({
      role: typeof row.role_name === 'string' ? row.role_name : '',
      is_primary: Boolean(row.is_primary),
    })),
    certifications: (certificationsResult.data ?? []).map((row) => ({
      id: row.id as string,
      cert_type: typeof row.cert_type === 'string' ? row.cert_type : 'Custom',
      cert_name: typeof row.cert_name === 'string' ? row.cert_name : null,
      expiry_date:
        typeof row.expiry_date === 'string' ? row.expiry_date : null,
    })),
    courseTemplates: (templatesResult.data ?? []).map((row) => ({
      id: row.id as string,
      name: typeof row.name === 'string' ? row.name : 'Course',
      is_required_for_all: Boolean(row.is_required_for_all),
      required_roles: Array.isArray(row.required_roles)
        ? row.required_roles.filter(
            (role): role is string => typeof role === 'string',
          )
        : null,
    })),
    courseCompletions: (completionsResult.data ?? []).map((row) => ({
      course_template_id:
        typeof row.course_template_id === 'string'
          ? row.course_template_id
          : '',
      started_at:
        typeof row.started_at === 'string' ? row.started_at : null,
      completed_at:
        typeof row.completed_at === 'string' ? row.completed_at : null,
      created_at:
        typeof row.created_at === 'string'
          ? row.created_at
          : new Date().toISOString(),
    })),
  }
}

export async function fetchStaffComplianceIssues(
  organizationId: string,
  staffPhone: string,
): Promise<StaffComplianceIssue[]> {
  const data = await loadStaffComplianceData(organizationId, staffPhone)
  return detectStaffComplianceIssues(data)
}

export interface StaffComplianceActionItemRow {
  id: string
  staff_phone: string
  issue_type: string
  category: string
  title: string
  priority: string
  deep_link: string
  reference_key: string
  status: string
}

export async function syncStaffComplianceActionItems(
  organizationId: string,
  staffPhone: string,
  staffDisplayName: string,
  issues: StaffComplianceIssue[],
): Promise<void> {
  const issueKeys = new Set(
    issues.map((issue) => `${issue.type}:${issue.referenceKey}`),
  )

  const { data: openItems, error: openItemsError } = await supabase
    .from('action_items')
    .select('id, issue_type, reference_key, status')
    .eq('organization_id', organizationId)
    .eq('staff_phone', staffPhone)
    .eq('category', 'staff_compliance')
    .eq('status', 'open')

  if (openItemsError) {
    console.error(
      '[StaffCompliance] load open action items failed',
      openItemsError,
    )
    return
  }

  const nowIso = new Date().toISOString()

  for (const item of openItems ?? []) {
    const key = `${item.issue_type}:${item.reference_key ?? ''}`
    if (!issueKeys.has(key)) {
      const { error } = await supabase
        .from('action_items')
        .update({
          status: 'resolved',
          resolved_at: nowIso,
          updated_at: nowIso,
        })
        .eq('id', item.id)
        .eq('organization_id', organizationId)

      if (error) {
        console.error('[StaffCompliance] resolve action item failed', error)
      }
    }
  }

  for (const issue of issues) {
    const alreadyOpen = (openItems ?? []).some(
      (item) =>
        item.issue_type === issue.type &&
        (item.reference_key ?? '') === issue.referenceKey,
    )

    if (alreadyOpen) {
      continue
    }

    const { error } = await supabase.from('action_items').insert({
      organization_id: organizationId,
      staff_phone: staffPhone,
      issue_type: issue.type,
      category: 'staff_compliance',
      title: `${staffDisplayName} — ${issue.titleSuffix}`,
      priority: issue.priority,
      deep_link: buildStaffProfileDeepLink(
        staffPhone,
        'certifications',
        issue.scrollTarget,
      ),
      reference_key: issue.referenceKey,
      status: 'open',
    })

    if (error && error.code !== '23505') {
      console.error('[StaffCompliance] create action item failed', error)
    }
  }
}

export async function loadOpenStaffComplianceActionItems(
  organizationId: string,
): Promise<StaffComplianceActionItemRow[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select(
      'id, staff_phone, issue_type, category, title, priority, deep_link, reference_key, status',
    )
    .eq('organization_id', organizationId)
    .eq('category', 'staff_compliance')
    .eq('status', 'open')
    .order('created_at', { ascending: false })

  if (error) {
    console.error(
      '[StaffCompliance] load org action items failed',
      error,
    )
    return []
  }

  return (data ?? []) as StaffComplianceActionItemRow[]
}

export const STAFF_COMPLIANCE_ITEM_TYPE = 'staff_compliance'

export function getStaffComplianceActionItemKey(actionItemId: string): string {
  return `staff-compliance:${actionItemId}`
}
