"use client"

import { Textarea } from "@/components/ui/textarea"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"

const MAX_LENGTH = 20000

interface OpenAnswerProps {
  questionId: string
  /** Id of the question prompt `<p>` in `question-card.tsx` — gives the textarea an accessible name beyond the placeholder. */
  promptId: string
  value: string | null
  disabled?: boolean
  onChange: (text: string) => void
}

/** Free-text answer, capped at 20 000 chars to match `save_answers_batch`'s validation (F5). */
export function OpenAnswer({ questionId, promptId, value, disabled, onChange }: OpenAnswerProps) {
  const text = value ?? ""

  return (
    <div className="flex flex-col gap-1">
      <Textarea
        id={questionId}
        aria-labelledby={promptId}
        value={text}
        disabled={disabled}
        maxLength={MAX_LENGTH}
        placeholder={learnAssessmentMessages.player.openAnswerPlaceholder}
        onChange={(event) => onChange(event.target.value)}
        rows={5}
      />
      <span className="self-end text-xs text-muted-foreground">
        {learnAssessmentMessages.player.charCount(text.length, MAX_LENGTH)}
      </span>
    </div>
  )
}
