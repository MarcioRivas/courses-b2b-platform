import { describe, expect, it } from "vitest"
import { localDateTimeToUtcIso, utcIsoToLocalDateTimeInput } from "./local-datetime"

describe("localDateTimeToUtcIso", () => {
  it("converts a Montevideo (UTC-3) wall-clock time to UTC", () => {
    expect(localDateTimeToUtcIso("2026-09-11T14:30", "America/Montevideo")).toBe("2026-09-11T17:30:00.000Z")
  })

  it("is a no-op offset for UTC itself", () => {
    expect(localDateTimeToUtcIso("2026-09-11T09:00", "UTC")).toBe("2026-09-11T09:00:00.000Z")
  })

  it("handles a zone ahead of UTC", () => {
    expect(localDateTimeToUtcIso("2026-09-11T10:00", "Europe/Madrid")).toBe("2026-09-11T08:00:00.000Z")
  })

  it("rejects an unparseable value", () => {
    expect(() => localDateTimeToUtcIso("not-a-date", "UTC")).toThrow()
  })
})

describe("utcIsoToLocalDateTimeInput", () => {
  it("round-trips through localDateTimeToUtcIso", () => {
    const iso = localDateTimeToUtcIso("2026-09-11T14:30", "America/Montevideo")
    expect(utcIsoToLocalDateTimeInput(iso, "America/Montevideo")).toBe("2026-09-11T14:30")
  })

  it("returns an empty string for null", () => {
    expect(utcIsoToLocalDateTimeInput(null, "UTC")).toBe("")
  })
})
