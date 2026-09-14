import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import type { AnswerValue } from "../hooks/use-autosave"
import type { AttemptQuestion } from "../types"

interface QuestionNavProps {
  questions: AttemptQuestion[]
  values: ReadonlyMap<string, AnswerValue>
  answeredCount: number
  totalCount: number
}

/**
 * Anchor nav (review N2, extracted from `AttemptPlayer`): jumps to
 * `#q-{position}` and marks questions that already have a non-empty answer.
 */
export function QuestionNav({ questions, values, answeredCount, totalCount }: QuestionNavProps) {
  return (
    <nav
      aria-label={learnAssessmentMessages.player.progressLabel(answeredCount, totalCount)}
      className="flex flex-wrap gap-2"
    >
      {questions.map((question) => {
        const value = values.get(question.attemptQuestionId)
        const answered = value?.selectedOptionId !== null || (value?.textAnswer ?? "").trim() !== ""
        return (
          <a
            key={question.attemptQuestionId}
            href={`#q-${question.position}`}
            className={`flex size-8 items-center justify-center rounded-lg text-xs font-medium transition-colors ${
              answered ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-brand-soft hover:text-sky-800 dark:hover:bg-sky-950/40 dark:hover:text-sky-300"
            }`}
          >
            {question.position}
          </a>
        )
      })}
    </nav>
  )
}
