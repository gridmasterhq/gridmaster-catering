import { supabase } from './supabase'
import { buildStaffCertificationsDeepLink } from './staffProfileNavigation'

const ALCOHOL_CERT_TYPES = new Set(['TIPS', 'TIPS On Premise', 'RAMP'])
export const STAFF_COMPLIANCE_CATEGORY = 'staff_compliance'
export const STAFF_COMPLIANCE_ITEM_TYPE = STAFF_COMPLIANCE_CATEGORY

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

export interface StaffComplianceActionItemCondition {
  entityType: StaffComplianceEntityType
  entityId: string
  title: string
  priority: StaffCompliancePriority
  deepLink: string
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

  const assignedAt = new Date(completion.assigned_at ?? completion.created_at)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  return assignedAt <= sevenDaysAgo
}

function getCourseName(
  completion: CourseCompletionRow,
  templatesById: Map<string, CourseTemplateRow>,
): string {
  return templatesById.get(completion.course_template_id)?.name ?? 'Course'
}

function isCourseNotStartedOverdue(completion: CourseCompletionRow): boolean {
  if (completion.completed_at) {
    return false
  }

  if (completion.passed !== null) {
    return false
  }

  const assignedAt = new Date(completion.assigned_at ?? completion.created_at)
  const sevenDaysAgo = new Date()
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

  return assignedAt < sevenDaysAgo
}

function isCourseDeadlineInFourDays(completion: CourseCompletionRow): boolean {
  if (completion.completed_at) {
    return false
  }

  if (!completion.deadline_at) {
    return false
  }

  const deadlineDate = completion.deadline_at.slice(0, 10)
  const today = todayIsoDate()

  if (deadlineDate < today) {
    return false
  }

  const deadline = new Date(`${deadlineDate}T12:00:00`)
  const todayAtNoon = new Date(`${today}T12:00:00`)
  const fourDaysFromNow = new Date(todayAtNoon)
  fourDaysFromNow.setDate(fourDaysFromNow.getDate() + 4)

  return deadline <= fourDaysFromNow
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

export function detectStaffComplianceActionItemConditions(
  data: StaffComplianceData,
  staffPhone: string,
  staffDisplayName: string,
): StaffComplianceActionItemCondition[] {
  const conditions: StaffComplianceActionItemCondition[] = []
  const deepLink = buildStaffCertificationsDeepLink(staffPhone)
  const templatesById = new Map(
    data.courseTemplates.map((template) => [template.id, template]),
  )

  if (
    hasBartenderRole(data.staffRoles) &&
    !data.certifications.some(isValidAlcoholCert)
  ) {
    conditions.push({
      entityType: 'staff',
      entityId: staffPhone,
      title: `${staffDisplayName} — No valid alcohol service cert on file`,
      priority: 'high',
      deepLink,
    })
  }

  for (const cert of data.certifications) {
    const certName = getCertDisplayName(cert)

    if (isCertExpired(cert.expiry_date)) {
      conditions.push({
        entityType: 'staff_cert',
        entityId: cert.id,
        title: `${staffDisplayName} — Cert expired: ${certName}`,
        priority: 'high',
        deepLink,
      })
      continue
    }

    if (isCertExpiringSoon(cert.expiry_date)) {
      conditions.push({
        entityType: 'staff_cert',
        entityId: cert.id,
        title: `${staffDisplayName} — Cert expiring soon: ${certName}`,
        priority: 'normal',
        deepLink,
      })
    }
  }

  for (const completion of data.courseCompletions) {
    const courseName = getCourseName(completion, templatesById)

    if (isCourseDeadlineInFourDays(completion)) {
      conditions.push({
        entityType: 'course_completion',
        entityId: completion.id,
        title: `${staffDisplayName} — Course deadline in 4 days: ${courseName}`,
        priority: 'high',
        deepLink,
      })
      continue
    }

    if (isCourseNotStartedOverdue(completion)) {
      conditions.push({
        entityType: 'course_completion',
        entityId: completion.id,
        title: `${staffDisplayName} — Required course overdue: ${courseName}`,
        priority: 'normal',
        deepLink,
      })
    }
  }

  return conditions
}

function getActionItemConditionKey(
  condition: StaffComplianceActionItemCondition,
): string {
  return `${condition.entityType}:${condition.entityId}`
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
  priority: string
  deep_link: string
  auto_resolves: boolean
  status: string
}

export type StaffComplianceActionItemRow = ActionItemRow

function isStaffScopedActionItem(
  item: ActionItemRow,
  staffPhone: string,
  certIds: Set<string>,
  completionIds: Set<string>,
): boolean {
  if (item.entity_type === 'staff' && item.entity_id === staffPhone) {
    return true
  }

  if (item.entity_type === 'staff_cert' && certIds.has(item.entity_id)) {
    return true
  }

  if (
    item.entity_type === 'course_completion' &&
    completionIds.has(item.entity_id)
  ) {
    return true
  }

  return false
}

export async function syncStaffComplianceActionItems(
  organizationId: string,
  staffPhone: string,
  staffDisplayName: string,
  data?: StaffComplianceData,
): Promise<void> {
  const complianceData =
    data ?? (await loadStaffComplianceData(organizationId, staffPhone))
  const conditions = detectStaffComplianceActionItemConditions(
    complianceData,
    staffPhone,
    staffDisplayName,
  )
  const conditionKeys = new Set(conditions.map(getActionItemConditionKey))

  const certIds = new Set(complianceData.certifications.map((cert) => cert.id))
  const completionIds = new Set(
    complianceData.courseCompletions.map((completion) => completion.id),
  )

  const { data: activeItems, error: activeItemsError } = await supabase
    .from('action_items')
    .select('id, entity_type, entity_id, status')
    .eq('organization_id', organizationId)
    .eq('category', STAFF_COMPLIANCE_CATEGORY)
    .eq('status', 'active')

  if (activeItemsError) {
    console.error(
      '[StaffCompliance] load active action items failed',
      activeItemsError,
    )
    return
  }

  const nowIso = new Date().toISOString()

  for (const item of activeItems ?? []) {
    if (
      !isStaffScopedActionItem(
        item as ActionItemRow,
        staffPhone,
        certIds,
        completionIds,
      )
    ) {
      continue
    }

    const key = `${item.entity_type}:${item.entity_id}`
    if (!conditionKeys.has(key)) {
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

  for (const condition of conditions) {
    const { error } = await supabase.from('action_items').upsert(
      {
        organization_id: organizationId,
        category: STAFF_COMPLIANCE_CATEGORY,
        entity_type: condition.entityType,
        entity_id: condition.entityId,
        title: condition.title,
        priority: condition.priority,
        deep_link: condition.deepLink,
        auto_resolves: true,
        status: 'active',
        resolved_at: null,
        updated_at: nowIso,
      },
      {
        onConflict: 'organization_id,category,entity_type,entity_id',
        ignoreDuplicates: false,
      },
    )

    if (error) {
      console.error('[StaffCompliance] upsert action item failed', error)
    }
  }
}

export async function loadActiveActionItems(
  organizationId: string,
): Promise<ActionItemRow[]> {
  const { data, error } = await supabase
    .from('action_items')
    .select(
      'id, category, entity_type, entity_id, title, priority, deep_link, auto_resolves, status',
    )
    .eq('organization_id', organizationId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })

  if (error) {
    console.error('[StaffCompliance] load active action items failed', error)
    return []
  }

  return (data ?? []) as ActionItemRow[]
}

/** @deprecated Use loadActiveActionItems */
export async function loadOpenStaffComplianceActionItems(
  organizationId: string,
): Promise<ActionItemRow[]> {
  const items = await loadActiveActionItems(organizationId)
  return items.filter((item) => item.category === STAFF_COMPLIANCE_CATEGORY)
}

export function getStaffComplianceActionItemKey(actionItemId: string): string {
  return `staff-compliance:${actionItemId}`
}
