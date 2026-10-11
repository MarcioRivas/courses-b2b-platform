import { describe, expect, it } from "vitest"
import { dayKey, formatDayLabel, formatInboxTime, formatMessageClock } from "./format-message-time"

const TZ = "America/Montevideo" // UTC-3
const NOW = new Date("2026-10-11T15:00:00Z") // 12:00 in Montevideo

describe("format-message-time", () => {
  it("keys the day in the org timezone, not UTC", () => {
    // 01:00 UTC on the 12th is still the 11th in Montevideo.
    expect(dayKey("2026-10-12T01:00:00Z", TZ)).toBe("2026-10-11")
  })

  it("formats a 24h clock in the org timezone", () => {
    expect(formatMessageClock("2026-10-11T17:30:00Z", TZ)).toBe("14:30")
  })

  it("labels today, yesterday and older days", () => {
    expect(formatDayLabel("2026-10-11T12:00:00Z", TZ, NOW)).toBe("Hoy")
    expect(formatDayLabel("2026-10-10T12:00:00Z", TZ, NOW)).toBe("Ayer")
    expect(formatDayLabel("2026-10-01T12:00:00Z", TZ, NOW)).toBe("01/10/2026")
  })

  it("shows the time for today's inbox rows and the date otherwise", () => {
    expect(formatInboxTime("2026-10-11T13:05:00Z", TZ, NOW)).toBe("10:05")
    expect(formatInboxTime("2026-10-10T13:05:00Z", TZ, NOW)).toBe("Ayer")
    expect(formatInboxTime("2026-09-30T13:05:00Z", TZ, NOW)).toBe("30/09/2026")
  })
})
