import { describe, expect, it } from "vitest"
import {
  assessmentConfigSchema,
  createAssessmentBlockSchema,
  type AssessmentConfigInput,
} from "@/features/assessments/schemas/assessment-schemas"

const LESSON_ID = "11111111-1111-4111-8111-111111111111"

const quiz: AssessmentConfigInput = {
  kind: "QUIZ",
  title: "Quiz de módulo",
  description: "",
  passingScore: "60",
  maxAttempts: "",
  durationMinutes: "",
  availableFrom: "",
  availableUntil: "",
  maxFiles: "",
  allowLateSubmissions: false,
}

const task: AssessmentConfigInput = {
  ...quiz,
  kind: "TASK",
  maxAttempts: "",
  maxFiles: "1",
  availableUntil: "2026-10-15T23:59",
}

const exam: AssessmentConfigInput = {
  ...quiz,
  kind: "EXAM",
  maxAttempts: "1",
  durationMinutes: "60",
  availableFrom: "2026-10-01T09:00",
  availableUntil: "2026-10-01T11:00",
}

describe("assessmentConfigSchema: QUIZ", () => {
  it("accepts a QUIZ with no window, duration or file limit", () => {
    expect(assessmentConfigSchema.safeParse(quiz).success).toBe(true)
  })

  it("rejects a title shorter than 2 characters", () => {
    expect(assessmentConfigSchema.safeParse({ ...quiz, title: "x" }).success).toBe(false)
  })

  it("rejects a passing score above 100", () => {
    expect(assessmentConfigSchema.safeParse({ ...quiz, passingScore: "101" }).success).toBe(false)
  })
})

describe("assessmentConfigSchema: TASK", () => {
  it("accepts a TASK with a deadline and a file limit", () => {
    expect(assessmentConfigSchema.safeParse(task).success).toBe(true)
  })

  it("rejects a TASK without a deadline", () => {
    expect(assessmentConfigSchema.safeParse({ ...task, availableUntil: "" }).success).toBe(false)
  })

  it("rejects a TASK without maxFiles", () => {
    expect(assessmentConfigSchema.safeParse({ ...task, maxFiles: "" }).success).toBe(false)
  })

  it("rejects a TASK with 0 or 11 files (valid range is 1..10)", () => {
    expect(assessmentConfigSchema.safeParse({ ...task, maxFiles: "0" }).success).toBe(false)
    expect(assessmentConfigSchema.safeParse({ ...task, maxFiles: "11" }).success).toBe(false)
  })
})

describe("assessmentConfigSchema: EXAM", () => {
  it("accepts a fully configured EXAM", () => {
    expect(assessmentConfigSchema.safeParse(exam).success).toBe(true)
  })

  it("rejects an EXAM missing duration", () => {
    expect(assessmentConfigSchema.safeParse({ ...exam, durationMinutes: "" }).success).toBe(false)
  })

  it("rejects an EXAM missing the availability window", () => {
    expect(assessmentConfigSchema.safeParse({ ...exam, availableFrom: "", availableUntil: "" }).success).toBe(false)
  })

  it("rejects a window where the end is not after the start", () => {
    const result = assessmentConfigSchema.safeParse({
      ...exam,
      availableFrom: "2026-10-01T11:00",
      availableUntil: "2026-10-01T09:00",
    })
    expect(result.success).toBe(false)
  })
})

describe("createAssessmentBlockSchema", () => {
  it("accepts a lesson id, the required flag and a QUIZ config", () => {
    const result = createAssessmentBlockSchema.safeParse({ lessonId: LESSON_ID, isRequired: true, config: quiz })
    expect(result.success).toBe(true)
  })

  it("rejects a non-guid lesson id", () => {
    const result = createAssessmentBlockSchema.safeParse({ lessonId: "nope", isRequired: true, config: quiz })
    expect(result.success).toBe(false)
  })
})
