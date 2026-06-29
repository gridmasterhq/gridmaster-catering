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

export function buildStaffProfileDeepLink(
  phone: string,
  tab: StaffProfileTabId = 'certifications',
  scrollTarget?: string,
): string {
  const payload: StaffProfileDeepLink = {
    phone,
    tab,
    ...(scrollTarget ? { scroll: scrollTarget } : {}),
  }

  return JSON.stringify(payload)
}

export function parseStaffProfileDeepLink(
  deepLink: string,
): StaffProfileDeepLink | null {
  try {
    const parsed = JSON.parse(deepLink) as StaffProfileDeepLink
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
