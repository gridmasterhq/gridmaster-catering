import { supabase } from './supabase'
import { formatCoordinatorStaffName } from './staffDisplayName'
import { buildStaffCertificationsDeepLink } from './staffProfileNavigation'

const ALCOHOL_CERT_TYPES = new Set(['TIPS', 'TIPS On Premise', 'RAMP'])
export const STAFF_COMPLIANCE_CATEGORY = 'staff_compliance'
export const STAFF_COMPLIANCE_ITEM_TYPE = STAFF_COMPLIANCE_CATEGORY
export const MISSING_TIPS_CERT_ENTITY_TYPE = 'staff'

export const ACTION_ITEM_STATUS_OPEN = 'open'
export const ACTION_ITEM_STATUS_RESOLVED = 'resolved'

export type StaffComplianceIssueType =
  | 'missing_alcohol_cert'
  | 'overdue_required_course'
  | 'cert_expiring_soon'
  | 'cert_expired'

export type StaffComplianceEntityType =
  | 'staff'
  | 'staff_cert'
  | 'course_completion'

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
  id: string
  course_template_id: string
  assigned_at: string | null
  deadline_at: string | null
  started_at: string | null
  completed_at: string | null
  passed: boolean | null
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

function normalizeCertType(certType: string): string {
  return certType.trim().toLowerCase()
}

export function hasTipsCert(certifications: StaffCertificationRow[]): boolean {
  return certifications.some(
    (cert) => normalizeCertType(cert.cert_type) === 'tips',
  )
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

  const assignedAt = new Date(completion.assigned_at ?? completion.created_at)
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

async function upsertMissingTipsActionItem(
  organizationId: string,
  staffPhone: string,
  staffFullName: string,
): Promise<void> {
  const nowIso = new Date().toISOString()
  const row = {
    organization_id: organizationId,
    category: STAFF_COMPLIANCE_CATEGORY,
    entity_type: MISSING_TIPS_CERT_ENTITY_TYPE,
    entity_id: staffPhone,
    title: `No alcohol cert on file — ${staffFullName}`,
    description: `${staffFullName} is a bartender with no TIPS certification on file.`,
    priority: 'high',
    status: ACTION_ITEM_STATUS_OPEN,
    deep_link: buildStaffCertificationsDeepLink(staffPhone),
    auto_resolves: true,
    resolved_at: null,
    resolved_by: null,
    updated_at: nowIso,
  }

  const { data: existing, error: existingError } = await supabase
    .from('action_items')
    .select('id')
    .eq('organization_id', organizationId)
    .eq('category', STAFF_COMPLIANCE_CATEGORY)
    .eq('entity_type', MISSING_TIPS_CERT_ENTITY_TYPE)
    .eq('entity_id', staffPhone)
    .maybeSingle()

  if (existingError) {
    console.error(
      '[StaffCompliance] load missing tips action item failed',
      existingError,
    )
    return
  }

  if (existing?.id) {
    const { error } = await supabase
      .from('action_items')
      .update(row)
      .eq('id', existing.id)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('[StaffCompliance] update missing tips action item failed', error)
    }
    return
  }

  const { error } = await supabase.from('action_items').insert({
    ...row,
    created_at: nowIso,
  })

  if (error) {
    console.error('[StaffCompliance] insert missing tips action item failed', error)
  }
}

async function resolveMissingTipsActionItem(
  organizationId: string,
  staffPhone: string,
): Promise<void> {
  const nowIso = new Date().toISOString()

  const { error } = await supabase
    .from('action_items')
    .update({
      status: ACTION_ITEM_STATUS_RESOLVED,
      resolved_at: nowIso,
      updated_at: nowIso,
    })
    .eq('organization_id', organizationId)
    .eq('category', STAFF_COMPLIANCE_CATEGORY)
    .eq('entity_type', MISSING_TIPS_CERT_ENTITY_TYPE)
    .eq('entity_id', staffPhone)
    .eq('status', ACTION_ITEM_STATUS_OPEN)

  if (error) {
    console.error('[StaffCompliance] resolve missing tips action item failed', error)
  }
}

export async function syncBartenderTipsComplianceForStaff(
  organizationId: string,
  staffPhone: string,
  staffDisplayName: string,
  staffRoles: StaffRoleRow[],
  certifications: StaffCertificationRow[],
): Promise<void> {
  const missingTips =
    hasBartenderRole(staffRoles) && !hasTipsCert(certifications)

  if (missingTips) {
    await upsertMissingTipsActionItem(
      organizationId,
      staffPhone,
      staffDisplayName,
    )
    return
  }

  await resolveMissingTipsActionItem(organizationId, staffPhone)
}

export async function scanOrganizationStaffCompliance(
  organizationId: string,
): Promise<void> {
  const [staffResult, rolesResult, certsResult, openItemsResult] =
    await Promise.all([
      supabase
        .from('staff')
        .select('phone, legal_name, display_name, status')
        .eq('organization_id', organizationId)
        .eq('status', 'active'),
      supabase
        .from('staff_roles')
        .select('staff_phone, role_name')
        .eq('organization_id', organizationId),
      supabase
        .from('staff_certifications')
        .select('staff_phone, cert_type')
        .eq('organization_id', organizationId),
      supabase
        .from('action_items')
        .select('id, entity_id')
        .eq('organization_id', organizationId)
        .eq('category', STAFF_COMPLIANCE_CATEGORY)
        .eq('entity_type', MISSING_TIPS_CERT_ENTITY_TYPE)
        .eq('status', ACTION_ITEM_STATUS_OPEN),
    ])

  if (staffResult.error) {
    console.error('[StaffCompliance] scan load staff failed', staffResult.error)
    return
  }

  if (rolesResult.error) {
    console.error('[StaffCompliance] scan load roles failed', rolesResult.error)
    return
  }

  if (certsResult.error) {
    console.error('[StaffCompliance] scan load certs failed', certsResult.error)
    return
  }

  if (openItemsResult.error) {
    console.error(
      '[StaffCompliance] scan load open action items failed',
      openItemsResult.error,
    )
    return
  }

  const bartenderPhones = new Set<string>()
  for (const row of rolesResult.data ?? []) {
    const phone =
      typeof row.staff_phone === 'string' ? row.staff_phone.trim() : ''
    const roleName =
      typeof row.role_name === 'string' ? row.role_name.trim() : ''
    if (phone && normalizeRoleKey(roleName) === 'bartender') {
      bartenderPhones.add(phone)
    }
  }

  const certsByPhone = new Map<string, StaffCertificationRow[]>()
  for (const row of certsResult.data ?? []) {
    const phone =
      typeof row.staff_phone === 'string' ? row.staff_phone.trim() : ''
    const certType =
      typeof row.cert_type === 'string' ? row.cert_type : ''
    if (!phone || !certType) {
      continue
    }

    const existing = certsByPhone.get(phone) ?? []
    existing.push({
      id: '',
      cert_type: certType,
      cert_name: null,
      expiry_date: null,
    })
    certsByPhone.set(phone, existing)
  }

  const staffByPhone = new Map<
    string,
    { legal_name: string; display_name: string | null }
  >()
  for (const row of staffResult.data ?? []) {
    const phone = typeof row.phone === 'string' ? row.phone.trim() : ''
    if (!phone) {
      continue
    }

    staffByPhone.set(phone, {
      legal_name:
        typeof row.legal_name === 'string' ? row.legal_name : 'Unknown',
      display_name:
        typeof row.display_name === 'string' ? row.display_name : null,
    })
  }

  const gapPhones = new Set<string>()

  for (const phone of bartenderPhones) {
    const staff = staffByPhone.get(phone)
    if (!staff) {
      continue
    }

    const certifications = certsByPhone.get(phone) ?? []
    if (hasTipsCert(certifications)) {
      await resolveMissingTipsActionItem(organizationId, phone)
      continue
    }

    gapPhones.add(phone)
    const fullName = formatCoordinatorStaffName(
      staff.display_name,
      staff.legal_name,
    )
    await upsertMissingTipsActionItem(organizationId, phone, fullName)
  }

  for (const item of openItemsResult.data ?? []) {
    const entityId =
      typeof item.entity_id === 'string' ? item.entity_id.trim() : ''
    if (!entityId || gapPhones.has(entityId)) {
      continue
    }

    const { error } = await supabase
      .from('action_items')
      .update({
        status: ACTION_ITEM_STATUS_RESOLVED,
        resolved_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', item.id)
      .eq('organization_id', organizationId)

    if (error) {
      console.error('[StaffCompliance] resolve stale action item failed', error)
    }
  }
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
        .select(
          'id, course_template_id, assigned_at, deadline_at, started_at, completed_at, passed, created_at',
        )
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
      id: row.id as string,
      course_template_id:
        typeof row.course_template_id === 'string'
          ? row.course_template_id
          : '',
      assigned_at:
        typeof row.assigned_at === 'string' ? row.assigned_at : null,
      deadline_at:
        typeof row.deadline_at === 'string' ? row.deadline_at : null,
      started_at:
        typeof row.started_at === 'string' ? row.started_at : null,
      completed_at:
        typeof row.completed_at === 'string' ? row.completed_at : null,
      passed: typeof row.passed === 'boolean' ? row.passed : null,
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

export interface ActionItemRow {
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

export type StaffComplianceActionItemRow = ActionItemRow

export async function loadOpenStaffComplianceActionItems(
  organizationId: string,
): Promise<ActionItemRow[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select(
      'id, category, entity_type, entity_id, title, description, priority, deep_link, auto_resolves, status',
    )
    .eq('organization_id', organizationId)
    .eq('category', STAFF_COMPLIANCE_CATEGORY)
    .eq('status', ACTION_ITEM_STATUS_OPEN)
    .order('created_at', { ascending: false })

  if (error) {
    console.error(
      '[StaffCompliance] load open staff compliance action items failed',
      error,
    )
    return []
  }

  return (data ?? []) as ActionItemRow[]
}

/** @deprecated Use loadOpenStaffComplianceActionItems */
export async function loadActiveActionItems(
  organizationId: string,
): Promise<ActionItemRow[]> {
  return loadOpenStaffComplianceActionItems(organizationId)
}

export function getStaffComplianceActionItemKey(actionItemId: string): string {
  return `staff-compliance:${actionItemId}`
}
