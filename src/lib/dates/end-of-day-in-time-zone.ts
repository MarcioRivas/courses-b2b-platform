/** Fallback when the caller cannot read the org's settings row (C16 default). */
export const DEFAULT_TIME_ZONE = "America/Montevideo"

/** How far `timeZone` is ahead of UTC at `instant`, in milliseconds. */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(instant)

  const values = new Map<string, number>()
  for (const part of parts) {
    if (part.type !== "literal") {
      values.set(part.type, Number(part.value))
    }
  }

  const get = (type: string): number => values.get(type) ?? 0

  // `hour` comes back as 24 at midnight under hour12:false in some runtimes.
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second")
  )

  return asUtc - instant.getTime()
}

/**
 * The UTC instant for 23:59:59 on `isoDate` (a `YYYY-MM-DD` date input value)
 * in `timeZone`.
 *
 * `new Date("2026-09-11T23:59:59")` resolves in the *server's* zone, so a
 * deployment in UTC would expire a Montevideo registration link three hours
 * before the end of the day the admin picked (C16).
 */
export function endOfDayInTimeZone(isoDate: string, timeZone: string): string {
  const asIfUtc = new Date(`${isoDate}T23:59:59Z`)

  if (Number.isNaN(asIfUtc.getTime())) {
    throw new Error(`endOfDayInTimeZone: invalid date "${isoDate}"`)
  }

  const offset = timeZoneOffsetMs(asIfUtc, timeZone)
  return new Date(asIfUtc.getTime() - offset).toISOString()
}
