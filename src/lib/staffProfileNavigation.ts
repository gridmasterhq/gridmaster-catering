export type StaffProfileTabId =
  | 'history'
  | 'certifications'
  | 'availability'
  | 'ai_summary'
  | 'development'
  | 'personal_note'

export interface StaffProfileOpenRequest {
  phone: string
  tab?: StaffProfileTabId
  scrollTarget?: string
}

export interface StaffProfileDeepLink {
  phone: string
  tab: StaffProfileTabId
  scroll?: string
}

type OpenStaffProfileHandler = (request: StaffProfileOpenRequest) => void

let openStaffProfileHandler: OpenStaffProfileHandler | null = null

export function registerStaffProfileNavigation(
  handler: OpenStaffProfileHandler,
): () => void {
  openStaffProfileHandler = handler
  return () => {
    if (openStaffProfileHandler === handler) {
      openStaffProfileHandler = null
    }
  }
}

export function openStaffProfileNavigation(
  request: StaffProfileOpenRequest,
): void {
  openStaffProfileHandler?.(request)
}

export function buildStaffCertificationsDeepLink(phone: string): string {
  return `/staff/${encodeURIComponent(phone)}/certifications`
}

export function buildStaffProfileDeepLink(
  phone: string,
  tab: StaffProfileTabId = 'certifications',
  scrollTarget?: string,
): string {
  if (tab === 'certifications' && !scrollTarget) {
    return buildStaffCertificationsDeepLink(phone)
  }

  const payload: StaffProfileDeepLink = {
    phone,
    tab,
    ...(scrollTarget ? { scroll: scrollTarget } : {}),
  }

  return JSON.stringify(payload)
}

const STAFF_CERTIFICATIONS_PATH =
  /^\/staff\/([^/]+)\/certifications\/?$/

export function parseStaffProfileDeepLink(
  deepLink: string,
): StaffProfileDeepLink | null {
  const trimmed = deepLink.trim()
  if (!trimmed) {
    return null
  }

  const pathMatch = STAFF_CERTIFICATIONS_PATH.exec(trimmed)
  if (pathMatch) {
    const phone = decodeURIComponent(pathMatch[1]).trim()
    if (!phone) {
      return null
    }

    return {
      phone,
      tab: 'certifications',
    }
  }

  try {
    const parsed = JSON.parse(trimmed) as StaffProfileDeepLink
    if (typeof parsed.phone !== 'string' || !parsed.phone.trim()) {
      return null
    }

    return {
      phone: parsed.phone.trim(),
      tab: parsed.tab ?? 'certifications',
      scroll: typeof parsed.scroll === 'string' ? parsed.scroll : undefined,
    }
  } catch {
    return null
  }
}
