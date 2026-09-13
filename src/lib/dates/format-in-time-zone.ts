/**
 * Display formatting for a UTC instant in the organization's timezone (C16).
 *
 * All stored dates are `timestamptz` and every comparison happens in UTC inside
 * Postgres; the zone only matters at the moment a human reads the value, which
 * is here.
 */
const DATE_OPTIONS: Intl.DateTimeFormatOptions = { day: "2-digit", month: "2-digit", year: "numeric" }
const TIME_OPTIONS: Intl.DateTimeFormatOptions = { hour: "2-digit", minute: "2-digit", hour12: false }

function format(iso: string, timeZone: string, options: Intl.DateTimeFormatOptions): string {
  const date = new Date(iso)

  if (Number.isNaN(date.getTime())) {
    return ""
  }

  return new Intl.DateTimeFormat("es-UY", { ...options, timeZone }).format(date)
}

/** "11/09/2026" */
export function formatDateInTimeZone(iso: string, timeZone: string): string {
  return format(iso, timeZone, DATE_OPTIONS)
}

/** "11/09/2026 14:30" */
export function formatDateTimeInTimeZone(iso: string, timeZone: string): string {
  return format(iso, timeZone, { ...DATE_OPTIONS, ...TIME_OPTIONS })
}
