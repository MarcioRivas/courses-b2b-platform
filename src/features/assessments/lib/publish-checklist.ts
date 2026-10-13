import type { AssessmentKind } from "../types"

export type PublishCheckKey = "hasQuestions" | "randomFits" | "examWindow" | "taskInstructions" | "taskDeadline"

export interface PublishCheckInput {
  kind: AssessmentKind
  questionCount: number
  randomQuestionCount: number | null
  durationSeconds: number | null
  availableFrom: string | null
  availableUntil: string | null
  instructions: string | null
}

/**
 * The publish rules as a checklist. Shared by the wizard's review step (shown
 * as ✓/✗) and `publishAssessment` (which refuses on the first failure), so the
 * two can never disagree.
 */
export function publishChecklist(input: PublishCheckInput): { key: PublishCheckKey; ok: boolean }[] {
  if (input.kind === "TASK") {
    return [
      { key: "taskInstructions", ok: Boolean(input.instructions?.trim()) },
      { key: "taskDeadline", ok: Boolean(input.availableUntil) },
    ]
  }

  const checks: { key: PublishCheckKey; ok: boolean }[] = [
    { key: "hasQuestions", ok: input.questionCount > 0 },
    { key: "randomFits", ok: input.randomQuestionCount === null || input.randomQuestionCount <= input.questionCount },
  ]
  if (input.kind === "EXAM") {
    checks.push({
      key: "examWindow",
      ok: Boolean(input.durationSeconds && input.availableFrom && input.availableUntil),
    })
  }
  return checks
}
