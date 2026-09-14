"use client"

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import type { AnswerValue } from "../hooks/use-autosave"
import type { AttemptQuestion } from "../types"
import { McAnswer } from "./mc-answer"
import { OpenAnswer } from "./open-answer"

interface QuestionCardProps {
  question: AttemptQuestion
  value: AnswerValue | undefined
  disabled: boolean
  showCorrectness: boolean
  /**
   * Omitted in read-only contexts (`AttemptResult` is a Server Component and
   * cannot pass a plain closure across the RSC boundary — only Server
   * Actions survive that trip). `disabled` already prevents any input from
   * firing a change in that case.
   */
  onChange?: (patch: { selectedOptionId?: string | null; textAnswer?: string | null }) => void
}

/** One question in the player, anchored as `#q-{position}` for the nav list. */
export function QuestionCard({ question, value, disabled, showCorrectness, onChange }: QuestionCardProps) {
  const copy = learnAssessmentMessages.player
  const handleChange = onChange ?? (() => {})
  const promptId = `${question.attemptQuestionId}-prompt`

  return (
    <Card id={`q-${question.position}`} className="scroll-mt-20 rounded-2xl border shadow-card ring-0">
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="inline-flex w-fit items-center rounded-full bg-brand-soft px-2.5 py-0.5 text-sky-800 dark:bg-sky-950/40 dark:text-sky-300">
            {copy.questionLabel(question.position)}
          </CardTitle>
          <div className="flex items-center gap-2">
            {showCorrectness && question.isCorrect !== null && (
              <Badge variant={question.isCorrect ? "success" : "destructive"}>
                {question.isCorrect
                  ? learnAssessmentMessages.result.correctAnswer
                  : learnAssessmentMessages.result.incorrectAnswer}
              </Badge>
            )}
            <Badge variant="outline">{copy.pointsLabel(question.points)}</Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <p id={promptId} className="text-sm">
          {question.prompt}
        </p>

        {question.type === "MULTIPLE_CHOICE" ? (
          <McAnswer
            questionId={question.attemptQuestionId}
            promptId={promptId}
            options={question.options}
            value={value?.selectedOptionId ?? null}
            disabled={disabled}
            onChange={(optionId) => handleChange({ selectedOptionId: optionId })}
          />
        ) : (
          <OpenAnswer
            questionId={question.attemptQuestionId}
            promptId={promptId}
            value={value?.textAnswer ?? null}
            disabled={disabled}
            onChange={(text) => handleChange({ textAnswer: text })}
          />
        )}

        {question.feedback && (
          <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">{question.feedback}</p>
        )}
      </CardContent>
    </Card>
  )
}
