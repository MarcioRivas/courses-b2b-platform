import { describe, expect, it } from "vitest"
import { formatDateInTimeZone, formatDateTimeInTimeZone } from "./format-in-time-zone"

describe("formatDateInTimeZone", () => {
  it("renders a UTC instant as the local day in Montevideo (UTC-3)", () => {
    // 2026-09-12 02:00 UTC is still 2026-09-11 in Montevideo: formatting in UTC
    // would show the student a deadline one day later than the admin set (C16).
    expect(formatDateInTimeZone("2026-09-12T02:00:00Z", "America/Montevideo")).toBe("11/09/2026")
  })

  it("renders the same instant as the next day in UTC", () => {
    expect(formatDateInTimeZone("2026-09-12T02:00:00Z", "UTC")).toBe("12/09/2026")
  })

  it("returns an empty string for an unparseable value rather than throwing", () => {
    expect(formatDateInTimeZone("not-a-date", "America/Montevideo")).toBe("")
  })
})

describe("formatDateTimeInTimeZone", () => {
  it("includes a 24h wall clock in the target zone", () => {
    expect(formatDateTimeInTimeZone("2026-09-11T17:30:00Z", "America/Montevideo")).toBe(
      "11/09/2026, 14:30"
    )
  })
})
