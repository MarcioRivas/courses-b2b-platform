import { assessmentQuestionSchema, type AssessmentQuestionInput } from "../schemas/assessment-question-schemas"
import type { EditorQuestion, EditorQuestionOption, QuestionType } from "../types"

/**
 * Client-side working copy of one question. `key` is a stable React key that
 * survives saves; `id` is the DB id once the question exists (the RPC diffs by
 * it). Points stay a string while typing.
 */
export interface QuestionDraft {
  key: string
  id?: string
  type: QuestionType
  prompt: string
  points: string
  options: EditorQuestionOption[]
}

let keySeq = 0
const nextKey = () => `q${Date.now().toString(36)}${(keySeq++).toString(36)}`

const defaultOptions = (): EditorQuestionOption[] => [
  { label: "", isCorrect: true },
  { label: "", isCorrect: false },
]

export function newQuestionDraft(type: QuestionType): QuestionDraft {
  return { key: nextKey(), type, prompt: "", points: "1", options: type === "MULTIPLE_CHOICE" ? defaultOptions() : [] }
}

export function toQuestionDraft(question: EditorQuestion): QuestionDraft {
  return {
    key: question.id,
    id: question.id,
    type: question.type,
    prompt: question.prompt,
    points: String(question.points),
    options: question.options.map((o) => ({ ...o })),
  }
}

/** Switching type keeps the prompt/points; MC gets a fresh pair of options when it has none. */
export function changeDraftType(draft: QuestionDraft, type: QuestionType): QuestionDraft {
  if (type === draft.type) return draft
  return { ...draft, type, options: type === "MULTIPLE_CHOICE" && draft.options.length < 2 ? defaultOptions() : draft.options }
}

export function moveDraft(drafts: QuestionDraft[], index: number, direction: -1 | 1): QuestionDraft[] {
  const target = index + direction
  if (target < 0 || target >= drafts.length) return drafts
  const next = [...drafts]
  ;[next[index], next[target]] = [next[target] as QuestionDraft, next[index] as QuestionDraft]
  return next
}

export type DraftValidation =
  | { ok: true; payload: AssessmentQuestionInput[] }
  | { ok: false; errors: Record<string, string> }

/** Validates every draft; errors are keyed by draft `key` (first issue per question). */
export function validateDrafts(drafts: QuestionDraft[]): DraftValidation {
  const errors: Record<string, string> = {}
  const payload: AssessmentQuestionInput[] = []

  for (const draft of drafts) {
    const parsed = assessmentQuestionSchema.safeParse({
      id: draft.id,
      type: draft.type,
      prompt: draft.prompt,
      points: draft.points,
      ...(draft.type === "MULTIPLE_CHOICE" ? { options: draft.options } : {}),
    })
    if (parsed.success) {
      payload.push(parsed.data)
    } else {
      errors[draft.key] = parsed.error.issues[0]?.message ?? "Pregunta inválida."
    }
  }

  return Object.keys(errors).length > 0 ? { ok: false, errors } : { ok: true, payload }
}

/** After a save, every draft adopts the DB id the RPC returned for its position. */
export function rebaseDrafts(drafts: QuestionDraft[], ids: string[]): QuestionDraft[] {
  return drafts.map((draft, index) => ({ ...draft, id: ids[index] ?? draft.id }))
}

export function totalPoints(drafts: QuestionDraft[]): number {
  return drafts.reduce((sum, d) => sum + (Number(d.points) > 0 ? Number(d.points) : 0), 0)
}
