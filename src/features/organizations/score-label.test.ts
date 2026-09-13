import { describe, expect, it } from "vitest"
import { resolveScoreLabel } from "./score-label"

const ranges = [
  { minScore: 90, maxScore: 100, label: "Excelente", isPassing: true },
  { minScore: 80, maxScore: 89, label: "Muy bueno", isPassing: true },
  { minScore: 70, maxScore: 79, label: "Bueno", isPassing: true },
  { minScore: 0, maxScore: 69, label: "No aprobado", isPassing: false },
]

describe("resolveScoreLabel", () => {
  it("resolves the range containing the percent", () => {
    expect(resolveScoreLabel(ranges, 95)?.label).toBe("Excelente")
    expect(resolveScoreLabel(ranges, 80)?.label).toBe("Muy bueno")
    expect(resolveScoreLabel(ranges, 70)?.label).toBe("Bueno")
    expect(resolveScoreLabel(ranges, 0)?.label).toBe("No aprobado")
  })

  it("returns null when no range matches", () => {
    expect(resolveScoreLabel([], 50)).toBeNull()
  })
})
