import { describe, expect, it } from "vitest"
import {
  assessmentKindDefaults,
  setAssessmentQuestionsSchema,
  updateAssessmentSchema,
} from "@/features/assessments/schemas/assessment-schemas"

describe("assessmentKindDefaults", () => {
  it("QUIZ is unlimited attempts, untimed, no window (B3, D12)", () => {
    expect(assessmentKindDefaults("QUIZ")).toEqual({
      maxAttempts: null,
      durationMinutes: null,
      availableFrom: "",
      availableUntil: "",
    })
  })

  it("TASK defaults to a single attempt", () => {
    expect(assessmentKindDefaults("TASK").maxAttempts).toBe(1)
  })

  it("EXAM defaults to a single attempt", () => {
    expect(assessmentKindDefaults("EXAM").maxAttempts).toBe(1)
  })
})

const baseUpdate = {
  assessmentId: "11111111-1111-4111-8111-111111111111",
  title: "Parcial 1",
  description: "",
  passingScore: "60",
  maxAttempts: "",
}

describe("updateAssessmentSchema", () => {
  it("accepts a QUIZ with no window or duration", () => {
    const result = updateAssessmentSchema.safeParse({ ...baseUpdate, kind: "QUIZ" })
    expect(result.success).toBe(true)
  })

  it("rejects an EXAM missing duration", () => {
    const result = updateAssessmentSchema.safeParse({
      ...baseUpdate,
      kind: "EXAM",
      availableFrom: "2026-10-01T09:00",
      availableUntil: "2026-10-01T11:00",
    })
    expect(result.success).toBe(false)
  })

  it("rejects an EXAM missing the availability window", () => {
    const result = updateAssessmentSchema.safeParse({
      ...baseUpdate,
      kind: "EXAM",
      durationMinutes: "60",
    })
    expect(result.success).toBe(false)
  })

  it("accepts a fully configured EXAM", () => {
    const result = updateAssessmentSchema.safeParse({
      ...baseUpdate,
      kind: "EXAM",
      durationMinutes: "60",
      availableFrom: "2026-10-01T09:00",
      availableUntil: "2026-10-01T11:00",
    })
    expect(result.success).toBe(true)
  })

  it("rejects a window where the end is before the start", () => {
    const result = updateAssessmentSchema.safeParse({
      ...baseUpdate,
      kind: "TASK",
      availableFrom: "2026-10-01T11:00",
      availableUntil: "2026-10-01T09:00",
    })
    expect(result.success).toBe(false)
  })

  it("accepts a TASK with an optional window left empty", () => {
    const result = updateAssessmentSchema.safeParse({ ...baseUpdate, kind: "TASK" })
    expect(result.success).toBe(true)
  })
})

describe("setAssessmentQuestionsSchema", () => {
  const assessmentId = "22222222-2222-4222-8222-222222222222"
  const bankId = "33333333-3333-4333-8333-333333333333"

  it("accepts a fixed-only question source", () => {
    const result = setAssessmentQuestionsSchema.safeParse({
      assessmentId,
      fixedQuestions: [{ questionId: "44444444-4444-4444-8444-444444444444", points: 2 }],
    })
    expect(result.success).toBe(true)
  })

  it("accepts a random-only configuration (bank + positive count)", () => {
    const result = setAssessmentQuestionsSchema.safeParse({
      assessmentId,
      fixedQuestions: [],
      randomBankId: bankId,
      randomCount: 5,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a non-positive random count", () => {
    const result = setAssessmentQuestionsSchema.safeParse({
      assessmentId,
      fixedQuestions: [],
      randomBankId: bankId,
      randomCount: 0,
    })
    expect(result.success).toBe(false)
  })

  it("rejects non-positive fixed question points", () => {
    const result = setAssessmentQuestionsSchema.safeParse({
      assessmentId,
      fixedQuestions: [{ questionId: "44444444-4444-4444-8444-444444444444", points: 0 }],
    })
    expect(result.success).toBe(false)
  })
})
