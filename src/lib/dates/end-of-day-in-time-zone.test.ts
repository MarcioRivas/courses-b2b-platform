import { describe, expect, it } from "vitest"
import { endOfDayInTimeZone } from "./end-of-day-in-time-zone"

describe("endOfDayInTimeZone", () => {
  it("returns the UTC instant for the end of the day in Montevideo (UTC-3)", () => {
    // 2026-09-11 23:59:59 in Montevideo is 2026-09-12 02:59:59 UTC.
    expect(endOfDayInTimeZone("2026-09-11", "America/Montevideo")).toBe("2026-09-12T02:59:59.000Z")
  })

  it("is a no-op offset for UTC itself", () => {
    expect(endOfDayInTimeZone("2026-09-11", "UTC")).toBe("2026-09-11T23:59:59.000Z")
  })

  it("handles a zone ahead of UTC", () => {
    // Madrid is UTC+2 in September (CEST).
    expect(endOfDayInTimeZone("2026-09-11", "Europe/Madrid")).toBe("2026-09-11T21:59:59.000Z")
  })

  it("never returns an instant before the chosen day", () => {
    const result = new Date(endOfDayInTimeZone("2026-09-11", "Pacific/Kiritimati"))
    expect(result.getTime()).toBeGreaterThan(new Date("2026-09-10T00:00:00Z").getTime())
  })

  it("rejects an unparseable date", () => {
    expect(() => endOfDayInTimeZone("not-a-date", "UTC")).toThrow()
  })
})
