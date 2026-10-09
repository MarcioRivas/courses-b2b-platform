"use client"

import { useEffect, useRef } from "react"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import { formatTimestamp } from "../lib/format-timestamp"
import type { CheckpointResult, StudentCheckpoint } from "../types"

interface CheckpointQuizDialogProps {
  checkpoint: StudentCheckpoint | null
  answers: Record<string, string>
  result: CheckpointResult | null
  submitting: boolean
  onAnswer: (questionId: string, optionId: string) => void
  onSubmit: () => void
  onRewatch: () => void
  onRetry: () => void
}

/**
 * Full-screen quiz, vertically centered, shown while the video is paused and hidden. It cannot be
 * dismissed (no close button; Escape and outside clicks are ignored because
 * `open` is controlled and `onOpenChange` is a no-op): the only ways out are
 * passing, or choosing to rewatch the segment.
 */
export function CheckpointQuizDialog({
  checkpoint,
  answers,
  result,
  submitting,
  onAnswer,
  onSubmit,
  onRewatch,
  onRetry,
}: CheckpointQuizDialogProps) {
  const copy = videoCheckpointMessages.student
  const firstInputRef = useRef<HTMLInputElement>(null)
  const failed = result !== null && !result.passed
  const hasAnswer = checkpoint?.questions.some((question) => answers[question.id] !== undefined) ?? false

  useEffect(() => {
    if (checkpoint) firstInputRef.current?.focus()
  }, [checkpoint])

  return (
    <Dialog open={checkpoint !== null} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false}
        className="top-0 left-0 h-dvh w-screen max-w-none translate-x-0 translate-y-0 overflow-y-auto rounded-none sm:max-w-none"
      >
        {checkpoint && (
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 self-center py-6">
            <div className="flex flex-col gap-1">
              <DialogTitle className="text-xl">{copy.quizTitle(formatTimestamp(checkpoint.atSeconds))}</DialogTitle>
              <DialogDescription>{copy.quizDescription}</DialogDescription>
            </div>

            {checkpoint.questions.map((question, questionIndex) => (
              <fieldset key={question.id} className="flex flex-col gap-2" disabled={submitting || failed}>
                <legend className="mb-1 text-base font-medium">{question.prompt}</legend>
                {question.options.map((option, optionIndex) => (
                  <label
                    key={option.id}
                    className="flex cursor-pointer items-center gap-3 rounded-md border p-3 has-checked:border-primary has-checked:bg-primary/5"
                  >
                    <input
                      ref={questionIndex === 0 && optionIndex === 0 ? firstInputRef : undefined}
                      type="radio"
                      name={question.id}
                      className="size-4 accent-primary"
                      checked={answers[question.id] === option.id}
                      onChange={() => onAnswer(question.id, option.id)}
                    />
                    <span>{option.label}</span>
                  </label>
                ))}
              </fieldset>
            ))}

            <div aria-live="polite">
              {failed && (
                <p className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                  {copy.failed}
                </p>
              )}
            </div>

            <div className="flex flex-wrap gap-2">
              {failed ? (
                <>
                  <Button type="button" variant="outline" onClick={onRewatch}>
                    {copy.rewatch}
                  </Button>
                  <Button type="button" onClick={onRetry}>
                    {copy.retry}
                  </Button>
                </>
              ) : (
                <>
                  {/* Always offered, so the student is never trapped in the dialog. */}
                  <Button type="button" variant="outline" disabled={submitting} onClick={onRewatch}>
                    {copy.rewatch}
                  </Button>
                  <Button type="button" disabled={submitting || !hasAnswer} onClick={onSubmit}>
                    {submitting ? copy.submitting : copy.submit}
                  </Button>
                </>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
