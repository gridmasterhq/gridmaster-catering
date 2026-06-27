export function formatDateForInput(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

const DISPLAY_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const

function parseInputDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) {
    return null
  }

  const parsed = new Date(
    Number(match[1]),
    Number(match[2]) - 1,
    Number(match[3]),
  )

  return Number.isNaN(parsed.getTime()) ? null : parsed
}

export function formatDateDisplay(value: Date | string): string {
  const date = value instanceof Date ? value : parseInputDate(value)
  if (!date) {
    return typeof value === 'string' ? value : ''
  }

  return `${DISPLAY_MONTHS[date.getMonth()]} ${date.getDate()}, ${date.getFullYear()}`
}
