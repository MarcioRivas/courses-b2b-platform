"use client"

import { useState } from "react"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { saveAttemptFeedback } from "../actions/save-attempt-feedback"
import { saveAttemptFeedbackSchema } from "../schemas/grading-schemas"
import { ScoreSummary } from "./score-summary"
import { AnswerGrader, type GradeTotals } from "./answer-grader"
import type { AttemptForGrading } from "../types"

interface GradingPanelProps {
  attempt: AttemptForGrading
}

/** Per-attempt review screen (D15): every open answer + the overall feedback box. */
export function GradingPanel({ attempt: initialAttempt }: GradingPanelProps) {
  const [attempt, setAttempt] = useState(initialAttempt)
  const [feedback, setFeedback] = useState(initialAttempt.overallFeedback ?? "")
  const [isSavingFeedback, setIsSavingFeedback] = useState(false)

  function handleGraded(questionId: string, pointsAwarded: number, questionFeedback: string | null, totals: GradeTotals) {
    setAttempt((prev) => {
      const questions = prev.questions.map((question) =>
        question.attemptQuestionId === questionId
          ? { ...question, pointsAwarded, feedback: questionFeedback }
          : question
      )
      const manualScore = questions
        .filter((question) => question.type === "OPEN_ENDED")
        .reduce((sum, question) => sum + (question.pointsAwarded ?? 0), 0)

      return {
        ...prev,
        questions,
        manualScore,
        status: totals.status,
        totalScore: totals.totalScore,
        scorePercent: totals.scorePercent,
        scoreLabel: totals.scoreLabel,
      }
    })
  }

  async function handleSaveFeedback() {
    const parsed = saveAttemptFeedbackSchema.safeParse({ attemptId: attempt.attemptId, feedback })
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? teachGradingMessages.errors.feedbackRequired)
      return
    }

    setIsSavingFeedback(true)
    const result = await saveAttemptFeedback(parsed.data)
    setIsSavingFeedback(false)

    if (!result.ok) {
      toast.error(result.message)
      return
    }
    toast.success(teachGradingMessages.panel.feedbackSaved)
  }

  return (
    <div className="flex flex-col gap-4">
      <ScoreSummary attempt={attempt} />
      <div className="flex flex-col gap-3">
        {attempt.questions.map((question) => (
          <AnswerGrader
            key={question.attemptQuestionId}
            attemptId={attempt.attemptId}
            question={question}
            onGraded={handleGraded}
          />
        ))}
      </div>
      <div className="flex flex-col gap-2 rounded-lg border bg-card p-4">
        <label htmlFor="overall-feedback" className="text-sm font-medium">
          {teachGradingMessages.panel.overallFeedbackLabel}
        </label>
        <Textarea
          id="overall-feedback"
          value={feedback}
          onChange={(event) => setFeedback(event.target.value)}
          rows={4}
          placeholder={teachGradingMessages.panel.overallFeedbackPlaceholder}
        />
        <Button onClick={handleSaveFeedback} disabled={isSavingFeedback} className="self-start">
          {isSavingFeedback ? messages.common.loading : messages.common.save}
        </Button>
      </div>
    </div>
  )
}
