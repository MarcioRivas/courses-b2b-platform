"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"

interface SubmitDialogProps {
  unansweredCount: number
  disabled?: boolean
  submitting: boolean
  /** H3: set when the last `onConfirm` failed — keeps the dialog open with the reason and a retry affordance instead of silently closing. */
  errorMessage?: string | null
  onConfirm: () => Promise<boolean>
}

/**
 * Confirmation before `submit_attempt` — answers are final once entregado
 * (§53). H3: only closes when `onConfirm` reports success; a failure (e.g.
 * `SESSION_LOCKED`, network error) keeps the dialog open with the error
 * inline so the student can retry instead of believing it went through.
 */
export function SubmitDialog({ unansweredCount, disabled, submitting, errorMessage, onConfirm }: SubmitDialogProps) {
  const [open, setOpen] = useState(false)
  const copy = learnAssessmentMessages.submitDialog
  const player = learnAssessmentMessages.player

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={disabled} />}>{player.submitAction}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">{copy.unansweredWarning(unansweredCount)}</p>
        {errorMessage && (
          <p role="alert" className="text-sm text-destructive">
            {errorMessage}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={submitting} onClick={() => setOpen(false)}>
            {copy.cancel}
          </Button>
          <Button
            disabled={submitting}
            onClick={async () => {
              const ok = await onConfirm()
              if (ok) {
                setOpen(false)
              }
            }}
          >
            {submitting ? player.submitting : errorMessage ? copy.retry : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
