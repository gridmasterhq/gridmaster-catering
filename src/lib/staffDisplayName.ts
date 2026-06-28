export function formatCoordinatorStaffName(
  displayName: string | null | undefined,
  legalName: string,
): string {
  const legalParts = legalName.trim().split(' ')
  const firstName = legalParts[0] ?? ''
  const lastName = legalParts.slice(-1)[0] ?? ''
  const preferredOrFirst = displayName ?? firstName
  const formatted = `${preferredOrFirst} ${lastName}`.trim()

  return formatted || 'Unknown'
}
