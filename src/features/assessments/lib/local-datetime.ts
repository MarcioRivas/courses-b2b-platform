/**
 * Converts a `datetime-local` input value (a naive "YYYY-MM-DDTHH:mm" wall
 * clock, no timezone) into the UTC instant it represents in `timeZone`, and
 * back. Same offset trick as `endOfDayInTimeZone` (C16), kept local to this
 * feature (mirrors `src/features/offerings/lib/local-datetime.ts`) rather
 * than promoted to `lib/dates` — each feature owns its one caller.
 */

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

  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"))

  return asUtc - instant.getTime()
}

/**
 * The UTC ISO instant for `localDateTime` ("YYYY-MM-DDTHH:mm") as wall-clock time in `timeZone`.
 *
 * Known caveat (code review, non-blocking for MVP): `timeZoneOffsetMs` samples the offset at
 * `asIfUtc`, not at the actual resulting instant, so a `localDateTime` that falls inside a DST
 * transition hour in `timeZone` can resolve one hour off. Harmless for `America/Montevideo`
 * (no DST); would need a second offset pass (recompute at the resolved instant, retry if it
 * disagrees) for any org timezone that observes DST.
 */
export function localDateTimeToUtcIso(localDateTime: string, timeZone: string): string {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(localDateTime)) {
    throw new Error(`localDateTimeToUtcIso: invalid date "${localDateTime}"`)
  }

  const asIfUtc = new Date(`${localDateTime}:00Z`)
  if (Number.isNaN(asIfUtc.getTime())) {
    throw new Error(`localDateTimeToUtcIso: invalid date "${localDateTime}"`)
  }

  const offset = timeZoneOffsetMs(asIfUtc, timeZone)
  return new Date(asIfUtc.getTime() - offset).toISOString()
}

/** Formats a UTC ISO instant back into a `datetime-local` input value in `timeZone`. */
export function utcIsoToLocalDateTimeInput(iso: string | null, timeZone: string): string {
  if (!iso) {
    return ""
  }

  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(iso))

  const values = new Map<string, string>()
  for (const part of parts) {
    if (part.type !== "literal") {
      values.set(part.type, part.value)
    }
  }

  return `${values.get("year")}-${values.get("month")}-${values.get("day")}T${values.get("hour")}:${values.get("minute")}`
}
