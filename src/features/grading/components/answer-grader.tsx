"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { gradeAnswer } from "../actions/grade-answer"
import { gradeAnswerSchema } from "../schemas/grading-schemas"
import type { AttemptQuestionForGrading, AttemptStatus } from "../types"

export interface GradeTotals {
  status: AttemptStatus
  totalScore: number
  scorePercent: number | null
  scoreLabel: string | null
}

interface AnswerGraderProps {
  attemptId: string
  question: AttemptQuestionForGrading
  onGraded: (questionId: string, pointsAwarded: number, feedback: string | null, totals: GradeTotals) => void
}

/** One answer row: MC renders the auto-grade read-only, OPEN_ENDED renders the points + feedback form. */
export function AnswerGrader({ attemptId, question, onGraded }: AnswerGraderProps) {
  const [points, setPoints] = useState(question.pointsAwarded ?? 0)
  const [feedback, setFeedback] = useState(question.feedback ?? "")
  const [isSaving, setIsSaving] = useState(false)
  const [isSaved, setIsSaved] = useState(false)

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

  async function handleSave() {
    const parsed = gradeAnswerSchema.safeParse({
      attemptId,
      attemptQuestionId: question.attemptQuestionId,
      points,
      feedback: feedback.trim() || undefined,
    })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? teachGradingMessages.errors.pointsAboveMax)
      return
    }

    setIsSaving(true)
    const result = await gradeAnswer(parsed.data)
    setIsSaving(false)

    if (!result.ok) {
      toast.error(result.message)
      return
    }

    setIsSaved(true)
    onGraded(question.attemptQuestionId, points, feedback.trim() || null, {
      status: result.data.status,
      totalScore: result.data.totalScore,
      scorePercent: result.data.scorePercent,
      scoreLabel: result.data.scoreLabel,
    })
    toast.success(teachGradingMessages.panel.answerSaved)
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
          value={points}
          onChange={(event) => {
            setIsSaved(false)
            setPoints(Number(event.target.value))
          }}
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor={feedbackId} className="text-sm font-medium">
          {teachGradingMessages.panel.feedbackLabel}
        </label>
        <Textarea
          id={feedbackId}
          value={feedback}
          onChange={(event) => {
            setIsSaved(false)
            setFeedback(event.target.value)
          }}
          rows={3}
        />
      </div>
      <Button onClick={handleSave} disabled={isSaving} className="self-start">
        {isSaving
          ? teachGradingMessages.panel.saving
          : isSaved
            ? teachGradingMessages.panel.saved
            : teachGradingMessages.panel.saveAnswer}
      </Button>
    </div>
  )
}
