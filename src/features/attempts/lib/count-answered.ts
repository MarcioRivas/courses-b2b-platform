import type { AnswerValue } from "../hooks/use-autosave"

/**
 * Counts questions with a non-empty answer (review N2, extracted from
 * `AttemptPlayer` for reuse by `QuestionNav`'s `answered` marker and unit
 * testing). A selected option counts immediately; free text only counts once
 * it has non-whitespace content.
 */
export function countAnswered(values: ReadonlyMap<string, AnswerValue>): number {
  let count = 0
  for (const value of values.values()) {
    if (value.selectedOptionId !== null || (value.textAnswer !== null && value.textAnswer.trim() !== "")) {
      count += 1
    }
  }
  return count
}
