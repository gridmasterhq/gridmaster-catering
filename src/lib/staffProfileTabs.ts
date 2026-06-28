export function getStaffProfileTabId(phone: string): string {
  return `staff-${phone}`
}

export function isStaffProfileTabId(tabId: string): boolean {
  return tabId.startsWith('staff-') && tabId !== 'staff-mgmt'
}

export function formatStaffProfileTabLabel(
  displayName: string | null | undefined,
  legalName: string,
): string {
  const legalParts = legalName.trim().split(/\s+/).filter(Boolean)
  const firstName = legalParts[0] ?? ''
  const lastInitial =
    legalParts.length > 1
      ? `${legalParts[legalParts.length - 1]!.charAt(0).toUpperCase()}.`
      : ''
  const preferredFirst = displayName?.trim().split(/\s+/)[0] ?? firstName

  if (lastInitial) {
    return `${preferredFirst} ${lastInitial}`
  }

  return preferredFirst || 'Unknown'
}
