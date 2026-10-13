import { describe, expect, it } from "vitest"
import {
  assessmentQuestionSchema,
  saveAssessmentQuestionsSchema,
} from "@/features/assessments/schemas/assessment-question-schemas"

const ASSESSMENT_ID = "22222222-2222-4222-8222-222222222222"
const QUESTION_ID = "44444444-4444-4444-8444-444444444444"

const mc = {
  type: "MULTIPLE_CHOICE" as const,
  prompt: "¿Cuánto es 2 + 2?",
  points: 2,
  options: [
    { label: "3", isCorrect: false },
    { label: "4", isCorrect: true },
  ],
}

describe("assessmentQuestionSchema", () => {
  it("accepts a MULTIPLE_CHOICE with 2 options and exactly one correct", () => {
    expect(assessmentQuestionSchema.safeParse(mc).success).toBe(true)
  })

  it("rejects an MC with no correct option", () => {
    const result = assessmentQuestionSchema.safeParse({
      ...mc,
      options: [
        { label: "3", isCorrect: false },
        { label: "5", isCorrect: false },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an MC with two correct options", () => {
    const result = assessmentQuestionSchema.safeParse({
      ...mc,
      options: [
        { label: "3", isCorrect: true },
        { label: "4", isCorrect: true },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects an MC with a single option (min 2) and with 7 options (max 6)", () => {
    expect(assessmentQuestionSchema.safeParse({ ...mc, options: [{ label: "4", isCorrect: true }] }).success).toBe(false)
    const seven = Array.from({ length: 7 }, (_, i) => ({ label: `o${i}`, isCorrect: i === 0 }))
    expect(assessmentQuestionSchema.safeParse({ ...mc, options: seven }).success).toBe(false)
  })

  it("rejects an option with an empty label", () => {
    const result = assessmentQuestionSchema.safeParse({
      ...mc,
      options: [
        { label: "  ", isCorrect: true },
        { label: "4", isCorrect: false },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("accepts an OPEN_ENDED without options", () => {
    expect(
      assessmentQuestionSchema.safeParse({ type: "OPEN_ENDED", prompt: "Explicá el teorema", points: 1 }).success
    ).toBe(true)
  })

  it("rejects non-positive points and points above 1000", () => {
    expect(assessmentQuestionSchema.safeParse({ ...mc, points: 0 }).success).toBe(false)
    expect(assessmentQuestionSchema.safeParse({ ...mc, points: 1001 }).success).toBe(false)
  })

  it("rejects a prompt shorter than 2 characters", () => {
    expect(assessmentQuestionSchema.safeParse({ ...mc, prompt: "x" }).success).toBe(false)
  })

  it("keeps an optional existing id (guid) so the RPC updates the row", () => {
    expect(assessmentQuestionSchema.safeParse({ ...mc, id: QUESTION_ID }).success).toBe(true)
    expect(assessmentQuestionSchema.safeParse({ ...mc, id: "not-a-guid" }).success).toBe(false)
  })
})

describe("saveAssessmentQuestionsSchema", () => {
  const questions = [{ type: "OPEN_ENDED" as const, prompt: "Explicá", points: 1 }]

  it("accepts an assessment with questions and no random draw (null)", () => {
    expect(saveAssessmentQuestionsSchema.safeParse({ assessmentId: ASSESSMENT_ID, questions, randomCount: null }).success).toBe(true)
  })

  it("accepts a random count between 1 and the number of questions", () => {
    const result = saveAssessmentQuestionsSchema.safeParse({
      assessmentId: ASSESSMENT_ID,
      questions: [...questions, { ...questions[0]!, prompt: "Otra" }],
      randomCount: 1,
    })
    expect(result.success).toBe(true)
  })

  it("rejects a random count larger than the question list", () => {
    const result = saveAssessmentQuestionsSchema.safeParse({ assessmentId: ASSESSMENT_ID, questions, randomCount: 2 })
    expect(result.success).toBe(false)
  })

  it("rejects a zero random count", () => {
    const result = saveAssessmentQuestionsSchema.safeParse({ assessmentId: ASSESSMENT_ID, questions, randomCount: 0 })
    expect(result.success).toBe(false)
  })

  it("rejects more than 200 questions", () => {
    const many = Array.from({ length: 201 }, (_, i) => ({ type: "OPEN_ENDED" as const, prompt: `P ${i}`, points: 1 }))
    expect(saveAssessmentQuestionsSchema.safeParse({ assessmentId: ASSESSMENT_ID, questions: many, randomCount: null }).success).toBe(false)
  })
})
