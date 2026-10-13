import { describe, expect, it } from "vitest"
import { publishChecklist, type PublishCheckInput } from "@/features/assessments/lib/publish-checklist"

const base: PublishCheckInput = {
  kind: "QUIZ",
  questionCount: 2,
  randomQuestionCount: null,
  durationSeconds: null,
  availableFrom: null,
  availableUntil: null,
  instructions: null,
}

const failing = (checks: { ok: boolean }[]) => checks.filter((c) => !c.ok).length

describe("publishChecklist: QUIZ", () => {
  it("passes with at least one question and no random draw", () => {
    const checks = publishChecklist(base)
    expect(checks.map((c) => c.key)).toEqual(["hasQuestions", "randomFits"])
    expect(failing(checks)).toBe(0)
  })

  it("fails hasQuestions when the list is empty", () => {
    const checks = publishChecklist({ ...base, questionCount: 0 })
    expect(checks.find((c) => c.key === "hasQuestions")?.ok).toBe(false)
  })

  it("fails randomFits when the random draw exceeds the question count", () => {
    const checks = publishChecklist({ ...base, questionCount: 2, randomQuestionCount: 3 })
    expect(checks.find((c) => c.key === "randomFits")?.ok).toBe(false)
  })

  it("passes randomFits for a draw equal to the question count", () => {
    const checks = publishChecklist({ ...base, questionCount: 2, randomQuestionCount: 2 })
    expect(checks.find((c) => c.key === "randomFits")?.ok).toBe(true)
  })

  it("does not require instructions or a window", () => {
    expect(publishChecklist(base).some((c) => c.key === "examWindow" || c.key === "taskDeadline")).toBe(false)
  })
})

describe("publishChecklist: EXAM", () => {
  const exam: PublishCheckInput = {
    ...base,
    kind: "EXAM",
    durationSeconds: 3600,
    availableFrom: "2026-10-01T09:00:00.000Z",
    availableUntil: "2026-10-01T11:00:00.000Z",
  }

  it("passes with questions, duration and a full window", () => {
    expect(failing(publishChecklist(exam))).toBe(0)
  })

  it("adds an examWindow check that fails without duration", () => {
    const checks = publishChecklist({ ...exam, durationSeconds: null })
    expect(checks.find((c) => c.key === "examWindow")?.ok).toBe(false)
  })

  it("adds an examWindow check that fails without an availability window", () => {
    const checks = publishChecklist({ ...exam, availableFrom: null })
    expect(checks.find((c) => c.key === "examWindow")?.ok).toBe(false)
  })
})

describe("publishChecklist: TASK", () => {
  const task: PublishCheckInput = {
    ...base,
    kind: "TASK",
    questionCount: 0,
    availableUntil: "2026-10-15T23:59:00.000Z",
    instructions: "Subí tu informe en PDF.",
  }

  it("never checks questions; it checks instructions and deadline only", () => {
    const checks = publishChecklist(task)
    expect(checks.map((c) => c.key)).toEqual(["taskInstructions", "taskDeadline"])
    expect(failing(checks)).toBe(0)
  })

  it("fails taskInstructions for whitespace-only instructions", () => {
    const checks = publishChecklist({ ...task, instructions: "   " })
    expect(checks.find((c) => c.key === "taskInstructions")?.ok).toBe(false)
  })

  it("fails taskDeadline when there is no deadline", () => {
    const checks = publishChecklist({ ...task, availableUntil: null })
    expect(checks.find((c) => c.key === "taskDeadline")?.ok).toBe(false)
  })
})
