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
            className={`flex size-8 items-center justify-center rounded-md border text-xs font-medium ${
              answered ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
            }`}
          >
            {question.position}
          </a>
        )
      })}
    </nav>
  )
}
