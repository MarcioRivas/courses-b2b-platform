import { describe, expect, it } from "vitest"
import { computeAttemptScore } from "@/features/grading/lib/compute-attempt-score"

const mc = (id: string, points: number, pointsAwarded: number | null) => ({
  attemptQuestionId: id,
  type: "MULTIPLE_CHOICE" as const,
  points,
  pointsAwarded,
})

const open = (id: string, points: number, pointsAwarded: number | null) => ({
  attemptQuestionId: id,
  type: "OPEN_ENDED" as const,
  points,
  pointsAwarded,
})

describe("computeAttemptScore", () => {
  it("multiple choice only: sums saved auto points, no ungraded items", () => {
    const score = computeAttemptScore({
      questions: [mc("a", 1, 1), mc("b", 2, 0), mc("c", 1, 1)],
      manualPoints: {},
    })
    expect(score).toEqual({
      autoScore: 2,
      manualScore: 0,
      totalScore: 2,
      maxScore: 4,
      percent: 50,
      ungradedCount: 0,
    })
  })

  it("open answers only: uses the points entered in the editor over the saved value", () => {
    const score = computeAttemptScore({
      questions: [open("o1", 5, null), open("o2", 5, 1)],
      manualPoints: { o1: 4, o2: 2 },
    })
    expect(score.autoScore).toBe(0)
    expect(score.manualScore).toBe(6)
    expect(score.totalScore).toBe(6)
    expect(score.maxScore).toBe(10)
    expect(score.percent).toBe(60)
    expect(score.ungradedCount).toBe(0)
  })

  it("falls back to the saved pointsAwarded for open questions missing from the map", () => {
    const score = computeAttemptScore({
      questions: [open("o1", 4, 3)],
      manualPoints: {},
    })
    expect(score.manualScore).toBe(3)
    expect(score.percent).toBe(75)
    expect(score.ungradedCount).toBe(0)
  })

  it("mixed: MC auto points plus open manual points against the combined max", () => {
    const score = computeAttemptScore({
      questions: [mc("m1", 1, 1), mc("m2", 1, 0), open("o1", 2, null)],
      manualPoints: { o1: 1.5 },
    })
    expect(score.autoScore).toBe(1)
    expect(score.manualScore).toBe(1.5)
    expect(score.totalScore).toBe(2.5)
    expect(score.maxScore).toBe(4)
    expect(score.percent).toBe(62.5)
  })

  it("counts open questions with a null entry as ungraded and excludes them from the total", () => {
    const score = computeAttemptScore({
      questions: [mc("m1", 1, 1), open("o1", 3, null), open("o2", 3, null)],
      manualPoints: { o1: 2, o2: null },
    })
    expect(score.ungradedCount).toBe(1)
    expect(score.manualScore).toBe(2)
    expect(score.totalScore).toBe(3)
    expect(score.maxScore).toBe(7)
    expect(score.percent).toBe(42.86)
  })

  it("treats an undefined map entry as a fallback to the saved value, not as ungraded", () => {
    const score = computeAttemptScore({
      questions: [open("o1", 2, null)],
      manualPoints: { o1: undefined },
    })
    expect(score.ungradedCount).toBe(1)
    expect(score.manualScore).toBe(0)
  })

  it("max 0 gives percent null and never divides by zero", () => {
    const score = computeAttemptScore({ questions: [], manualPoints: {} })
    expect(score.maxScore).toBe(0)
    expect(score.percent).toBeNull()
    expect(score.totalScore).toBe(0)
    expect(score.ungradedCount).toBe(0)
  })

  it("max 0 with a zero-point question also gives percent null", () => {
    const score = computeAttemptScore({
      questions: [mc("m1", 0, 0)],
      manualPoints: {},
    })
    expect(score.percent).toBeNull()
  })

  it("rounds the percent to 2 decimals the way the SQL round(numeric, 2) does", () => {
    // 2 / 3 = 66.666... -> 66.67 (SQL round half-up on positive values)
    const twoThirds = computeAttemptScore({
      questions: [mc("m1", 3, 2)],
      manualPoints: {},
    })
    expect(twoThirds.percent).toBe(66.67)

    // 1 / 8 = 12.5 exactly (no rounding needed)
    const oneEighth = computeAttemptScore({ questions: [mc("m1", 8, 1)], manualPoints: {} })
    expect(oneEighth.percent).toBe(12.5)

    // 1 / 3 = 33.333... -> 33.33
    const oneThird = computeAttemptScore({ questions: [mc("m1", 3, 1)], manualPoints: {} })
    expect(oneThird.percent).toBe(33.33)
  })

  it("rounds fractional point sums to 2 decimals before computing the percent", () => {
    const score = computeAttemptScore({
      questions: [open("o1", 3, null)],
      manualPoints: { o1: 0.1 + 0.2 },
    })
    expect(score.manualScore).toBe(0.3)
    expect(score.percent).toBe(10)
  })

  it("percent can reach exactly 100 and 0", () => {
    const full = computeAttemptScore({ questions: [mc("m1", 2, 2)], manualPoints: {} })
    expect(full.percent).toBe(100)
    const none = computeAttemptScore({ questions: [mc("m1", 2, 0)], manualPoints: {} })
    expect(none.percent).toBe(0)
  })
})
