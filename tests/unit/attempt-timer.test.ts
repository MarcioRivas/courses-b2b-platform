import { describe, expect, it } from "vitest"
import {
  computeRemainingMs,
  timerWarningLevel,
  type TimerSync,
} from "@/features/attempts/lib/compute-remaining"

describe("computeRemainingMs", () => {
  it("returns null when there is no deadline (untimed QUIZ, D12)", () => {
    const sync: TimerSync = { serverNow: 1000, effectiveEndAt: null, syncedAtPerfNow: 0 }
    expect(computeRemainingMs(sync, 5000)).toBeNull()
  })

  it("counts down as perf time advances past the sync point", () => {
    const sync: TimerSync = { serverNow: 0, effectiveEndAt: 10_000, syncedAtPerfNow: 100 }
    // 3s of perf time elapsed since sync → serverNow is now conceptually 3000ms in.
    expect(computeRemainingMs(sync, 3100)).toBe(7000)
  })

  it("never reads Date.now(): remaining time is a pure function of the sync + perf delta", () => {
    const sync: TimerSync = { serverNow: 500, effectiveEndAt: 500, syncedAtPerfNow: 0 }
    // No perf time elapsed → remaining is exactly effectiveEndAt - serverNow.
    expect(computeRemainingMs(sync, 0)).toBe(0)
  })

  it("goes negative past the deadline instead of clamping", () => {
    const sync: TimerSync = { serverNow: 0, effectiveEndAt: 1000, syncedAtPerfNow: 0 }
    expect(computeRemainingMs(sync, 1500)).toBe(-500)
  })
})

describe("timerWarningLevel", () => {
  it("is none with no deadline", () => {
    expect(timerWarningLevel(null)).toBe("none")
  })

  it("is none above the 5 minute threshold", () => {
    expect(timerWarningLevel(5 * 60 * 1000 + 1)).toBe("none")
  })

  it("is 5min at and below the 5 minute threshold", () => {
    expect(timerWarningLevel(5 * 60 * 1000)).toBe("5min")
    expect(timerWarningLevel(3 * 60 * 1000)).toBe("5min")
  })

  it("is 1min at and below the 1 minute threshold", () => {
    expect(timerWarningLevel(60 * 1000)).toBe("1min")
    expect(timerWarningLevel(1)).toBe("1min")
  })

  it("is expired at and below zero", () => {
    expect(timerWarningLevel(0)).toBe("expired")
    expect(timerWarningLevel(-1)).toBe("expired")
  })
})
