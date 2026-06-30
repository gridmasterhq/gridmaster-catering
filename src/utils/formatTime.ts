import { formatInTimeZone } from 'date-fns-tz'

/**
 * Single platform entry point for formatting dates/times in an org's IANA timezone.
 */
export function formatInOrgTz(
  dateOrString: Date | string,
  formatStr: string,
  timezone: string,
): string {
  let value: Date | string = dateOrString

  if (
    typeof dateOrString === 'string' &&
    /^\d{4}-\d{2}-\d{2}$/.test(dateOrString.slice(0, 10)) &&
    !dateOrString.includes('T')
  ) {
    value = `${dateOrString.slice(0, 10)}T12:00:00`
  }

  return formatInTimeZone(value, timezone, formatStr)
}
