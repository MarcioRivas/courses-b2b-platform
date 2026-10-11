"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { resolveScoreLabel, type ScoreRangeForLabel } from "@/features/organizations/score-label"
import { saveAttemptGrades } from "../actions/save-attempt-grades"
import { computeAttemptScore } from "../lib/compute-attempt-score"
import { ScoreSummary } from "./score-summary"
import { AnswerGrader, type AnswerGradeValue } from "./answer-grader"
import { GradePreviewDialog } from "./grade-preview-dialog"
import { useUnsavedChangesGuard } from "./use-unsaved-changes-guard"
import type { AttemptForGrading } from "../types"

interface GradingPanelProps {
  attempt: AttemptForGrading
  scoreRanges: ScoreRangeForLabel[]
}

/** Per-attempt review (D15): all open answers + overall feedback, ONE "Guardar" that previews then persists in a single transaction. */
export function GradingPanel({ attempt, scoreRanges }: GradingPanelProps) {
  const router = useRouter()
  const [values, setValues] = useState<Record<string, AnswerGradeValue>>(() =>
    Object.fromEntries(
      attempt.questions
        .filter((q) => q.type === "OPEN_ENDED")
        .map((q) => [q.attemptQuestionId, { points: q.pointsAwarded === null ? "" : String(q.pointsAwarded), feedback: q.feedback ?? "" }])
    )
  )
  const [feedback, setFeedback] = useState(attempt.overallFeedback ?? "")
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [feedbackError, setFeedbackError] = useState<string | null>(null)
  const [dirty, setDirty] = useState(false)
  const [previewOpen, setPreviewOpen] = useState(false)
  useUnsavedChangesGuard(dirty)

  const score = useMemo(() => {
    const manualPoints: Record<string, number | null> = {}
    for (const [id, v] of Object.entries(values)) {
      const n = v.points.trim() === "" ? null : Number(v.points)
      manualPoints[id] = n === null || Number.isNaN(n) ? null : n
    }
    return computeAttemptScore({ questions: attempt.questions, manualPoints })
  }, [values, attempt.questions])

  const range = score.percent === null ? null : resolveScoreLabel(scoreRanges, score.percent)
  const liveAttempt: AttemptForGrading = {
    ...attempt,
    autoScore: score.autoScore,
    manualScore: score.manualScore,
    totalScore: score.totalScore,
    scorePercent: score.percent,
    scoreLabel: range?.label ?? null,
    passed: range?.isPassing ?? null,
  }

  function handleAnswerChange(id: string, value: AnswerGradeValue) {
    setDirty(true)
    setValues((prev) => ({ ...prev, [id]: value }))
    setErrors((prev) => ({ ...prev, [id]: "" }))
  }

  /** Client pre-check; the server re-validates everything. */
  function validate(): boolean {
    const next: Record<string, string> = {}
    for (const q of attempt.questions) {
      if (q.type !== "OPEN_ENDED") {
        continue
      }
      const raw = values[q.attemptQuestionId]?.points.trim()
      if (!raw) {
        // A saved grade cannot be cleared (the batch only upserts): blank would
        // preview as ungraded while the server keeps the old points.
        if (q.pointsAwarded !== null) {
          next[q.attemptQuestionId] = teachGradingMessages.errors.pointsRange(q.points)
        }
        continue
      }
      const n = Number(raw)
      if (Number.isNaN(n) || n < 0 || n > q.points) {
        next[q.attemptQuestionId] = teachGradingMessages.errors.pointsRange(q.points)
      }
    }
    setErrors(next)
    const missingFeedback = feedback.trim() === ""
    setFeedbackError(missingFeedback ? teachGradingMessages.errors.feedbackRequired : null)
    return Object.keys(next).length === 0 && !missingFeedback
  }

  async function handleConfirm() {
    const grades = Object.entries(values)
      .filter(([, v]) => v.points.trim() !== "")
      .map(([attemptQuestionId, v]) => ({
        attemptQuestionId,
        points: Number(v.points),
        feedback: v.feedback.trim() || undefined,
      }))
    const result = await saveAttemptGrades({ attemptId: attempt.attemptId, grades, feedback })
    if (result.ok) {
      setDirty(false)
      toast.success(teachGradingMessages.panel.gradesSaved(result.data.scorePercent, result.data.scoreLabel))
      router.refresh()
    }
    return result
  }

  return (
    <div className="flex flex-col gap-4">
      <ScoreSummary attempt={liveAttempt} />
      <div className="flex flex-col gap-3">
        {attempt.questions.map((question) => (
          <AnswerGrader
            key={question.attemptQuestionId}
            question={question}
            value={values[question.attemptQuestionId] ?? { points: "", feedback: "" }}
            onChange={(value) => handleAnswerChange(question.attemptQuestionId, value)}
            error={errors[question.attemptQuestionId] || undefined}
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
          onChange={(event) => {
            setDirty(true)
            setFeedback(event.target.value)
            setFeedbackError(null)
          }}
          rows={4}
          aria-invalid={feedbackError ? true : undefined}
          placeholder={teachGradingMessages.panel.overallFeedbackPlaceholder}
        />
        {feedbackError && (
          <p role="alert" className="text-sm text-destructive">
            {feedbackError}
          </p>
        )}
      </div>
      <div className="sticky bottom-0 -mx-1 flex items-center justify-between gap-3 border-t bg-background/95 px-1 py-3 backdrop-blur">
        <p className="text-sm text-muted-foreground">{dirty ? teachGradingMessages.panel.unsavedHint : ""}</p>
        <Button onClick={() => validate() && setPreviewOpen(true)}>{teachGradingMessages.panel.saveAction}</Button>
      </div>
      <GradePreviewDialog
        open={previewOpen}
        onOpenChange={setPreviewOpen}
        percent={score.percent}
        label={range?.label ?? null}
        isPassing={range?.isPassing ?? null}
        ungradedCount={score.ungradedCount}
        onConfirm={handleConfirm}
      />
    </div>
  )
}
