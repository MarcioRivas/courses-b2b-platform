import { describe, expect, it } from "vitest"
import { hasOverlappingRange } from "./score-range-overlap"

describe("hasOverlappingRange", () => {
  const existing = [
    { id: "a", minScore: 0, maxScore: 69 },
    { id: "b", minScore: 70, maxScore: 79 },
  ]

  it("detects an overlap with an existing range", () => {
    expect(hasOverlappingRange(existing, { minScore: 65, maxScore: 75 })).toBe(true)
  })

  it("allows adjacent, non-overlapping ranges", () => {
    expect(hasOverlappingRange(existing, { minScore: 80, maxScore: 89 })).toBe(false)
  })

  it("ignores the range being edited (same id)", () => {
    expect(hasOverlappingRange(existing, { id: "b", minScore: 70, maxScore: 85 })).toBe(false)
  })

  it("detects overlap against another range even while editing a third one", () => {
    expect(hasOverlappingRange(existing, { id: "c", minScore: 65, maxScore: 75 })).toBe(true)
  })
})
