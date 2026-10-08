import type { EditorCheckpoint } from "../types"

/**
 * Editor-side draft of a block's checkpoints. Every level carries a client
 * `key` for React lists; saved items also keep their DB `id`, which is sent
 * back on save so they keep student progress and statistics.
 */
export interface DraftOption {
  key: string
  id?: string
  label: string
  isCorrect: boolean
}

export interface DraftQuestion {
  key: string
  id?: string
  prompt: string
  options: DraftOption[]
}

export interface DraftCheckpoint {
  key: string
  id?: string
  atSeconds: number
  minCorrect: number
  questions: DraftQuestion[]
}

const newKey = () => crypto.randomUUID()

export function newOption(isCorrect = false): DraftOption {
  return { key: newKey(), label: "", isCorrect }
}

export function newQuestion(): DraftQuestion {
  return { key: newKey(), prompt: "", options: [newOption(true), newOption()] }
}

export function newCheckpoint(atSeconds: number): DraftCheckpoint {
  return { key: newKey(), atSeconds, minCorrect: 1, questions: [newQuestion()] }
}

export function toDraft(checkpoints: EditorCheckpoint[]): DraftCheckpoint[] {
  return checkpoints.map((checkpoint) => ({
    ...checkpoint,
    key: checkpoint.id ?? newKey(),
    questions: checkpoint.questions.map((question) => ({
      ...question,
      key: question.id ?? newKey(),
      options: question.options.map((option) => ({ ...option, key: option.id ?? newKey() })),
    })),
  }))
}

/** Strips client keys and orders by time: the `save_video_checkpoints` payload. */
export function toPayload(drafts: DraftCheckpoint[]): EditorCheckpoint[] {
  return [...drafts]
    .sort((a, b) => a.atSeconds - b.atSeconds)
    .map(({ id, atSeconds, minCorrect, questions }) => ({
      ...(id ? { id } : {}),
      atSeconds,
      // A removed question can leave minCorrect above the count; clamp it.
      minCorrect: Math.min(minCorrect, Math.max(questions.length, 1)),
      questions: questions.map(({ id: questionId, prompt, options }) => ({
        ...(questionId ? { id: questionId } : {}),
        prompt,
        options: options.map(({ id: optionId, label, isCorrect }) => ({
          ...(optionId ? { id: optionId } : {}),
          label,
          isCorrect,
        })),
      })),
    }))
}

/** Marks one option correct and the others not (single-answer questions). */
export function setCorrectOption(question: DraftQuestion, optionKey: string): DraftQuestion {
  return { ...question, options: question.options.map((o) => ({ ...o, isCorrect: o.key === optionKey })) }
}
