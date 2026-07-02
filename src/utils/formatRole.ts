export function formatRoleName(roleName: string): string {
  const trimmed = roleName.trim()
  if (!trimmed) {
    return ''
  }

  if (trimmed.toLowerCase() === 'cit') {
    return 'CIT'
  }

  return trimmed.charAt(0).toUpperCase() + trimmed.slice(1)
}

export function isCitRole(roleName: string): boolean {
  const normalized = roleName.trim().toLowerCase()
  return normalized === 'cit' || normalized === 'captain in training'
}
