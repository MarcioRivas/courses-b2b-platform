"use client"

import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import type { AttemptQuestionForGrading } from "../types"

export interface AnswerGradeValue {
  /** Raw input text; "" means not graded yet. */
  points: string
  feedback: string
}

interface AnswerGraderProps {
  question: AttemptQuestionForGrading
  value: AnswerGradeValue
  onChange: (value: AnswerGradeValue) => void
  error?: string
}

/** One answer row: MC renders the auto-grade read-only, OPEN_ENDED a controlled points + feedback form (saved by the panel). */
export function AnswerGrader({ question, value, onChange, error }: AnswerGraderProps) {
  if (question.type === "MULTIPLE_CHOICE") {
    return (
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <p className="text-sm font-medium">{question.prompt}</p>
          <Badge variant={question.isCorrect ? "default" : "destructive"}>
            {question.isCorrect ? teachGradingMessages.panel.correctBadge : teachGradingMessages.panel.incorrectBadge}
          </Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          {teachGradingMessages.panel.autoGradedNote(question.pointsAwarded ?? 0, question.points)}
        </p>
      </div>
    )
  }

  const pointsId = `points-${question.attemptQuestionId}`
  const feedbackId = `feedback-${question.attemptQuestionId}`

  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <p className="text-sm font-medium">{question.prompt}</p>
      <p className="rounded-md bg-muted p-3 text-sm whitespace-pre-wrap">
        {question.textAnswer || teachGradingMessages.panel.noAnswer}
      </p>
      <div className="flex flex-col gap-1 sm:max-w-40">
        <label htmlFor={pointsId} className="text-sm font-medium">
          {teachGradingMessages.panel.pointsLabel(question.points)}
        </label>
        <Input
          id={pointsId}
          type="number"
          min={0}
          max={question.points}
          step={0.5}
          value={value.points}
          aria-invalid={error ? true : undefined}
          onChange={(event) => onChange({ ...value, points: event.target.value })}
        />
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={feedbackId} className="text-sm font-medium">
          {teachGradingMessages.panel.feedbackLabel}
        </label>
        <Textarea
          id={feedbackId}
          value={value.feedback}
          onChange={(event) => onChange({ ...value, feedback: event.target.value })}
          rows={3}
        />
      </div>
    </div>
  )
}
