import { describe, expect, it } from "vitest"
import { questionFormSchema } from "@/features/questions/schemas/question-schemas"

describe("questionFormSchema", () => {
  it("accepts a valid multiple choice question with exactly one correct option", () => {
    const result = questionFormSchema.safeParse({
      type: "MULTIPLE_CHOICE",
      prompt: "2 + 2 = ?",
      defaultPoints: 1,
      options: [
        { label: "3", isCorrect: false },
        { label: "4", isCorrect: true },
      ],
    })
    expect(result.success).toBe(true)
  })

  it("rejects fewer than 2 options", () => {
    const result = questionFormSchema.safeParse({
      type: "MULTIPLE_CHOICE",
      prompt: "Only one option",
      defaultPoints: 1,
      options: [{ label: "Only", isCorrect: true }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects more than 6 options", () => {
    const options = Array.from({ length: 7 }, (_, i) => ({ label: `Option ${i}`, isCorrect: i === 0 }))
    const result = questionFormSchema.safeParse({
      type: "MULTIPLE_CHOICE",
      prompt: "Too many options",
      defaultPoints: 1,
      options,
    })
    expect(result.success).toBe(false)
  })

  it("rejects zero correct options", () => {
    const result = questionFormSchema.safeParse({
      type: "MULTIPLE_CHOICE",
      prompt: "No correct answer marked",
      defaultPoints: 1,
      options: [
        { label: "A", isCorrect: false },
        { label: "B", isCorrect: false },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("rejects more than one correct option", () => {
    const result = questionFormSchema.safeParse({
      type: "MULTIPLE_CHOICE",
      prompt: "Two correct answers marked",
      defaultPoints: 1,
      options: [
        { label: "A", isCorrect: true },
        { label: "B", isCorrect: true },
      ],
    })
    expect(result.success).toBe(false)
  })

  it("accepts an OPEN_ENDED question with just prompt + default points", () => {
    const result = questionFormSchema.safeParse({
      type: "OPEN_ENDED",
      prompt: "Explain the offside rule.",
      defaultPoints: 5,
    })
    expect(result.success).toBe(true)
  })

  it("rejects non-positive default points", () => {
    const result = questionFormSchema.safeParse({
      type: "OPEN_ENDED",
      prompt: "Explain the offside rule.",
      defaultPoints: 0,
    })
    expect(result.success).toBe(false)
  })
})
