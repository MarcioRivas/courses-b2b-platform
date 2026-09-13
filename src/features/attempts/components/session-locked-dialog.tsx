"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"

interface SessionLockedDialogProps {
  open: boolean
  retrying: boolean
  onTakeOver: () => void
  onRetry: () => void
}

/**
 * Blocking dialog for the D3 takeover flow. Shown whenever this tab is
 * read-only — either it just opened a second tab and lost the race, or it
 * was the original tab and got displaced by a later takeover.
 */
export function SessionLockedDialog({ open, retrying, onTakeOver, onRetry }: SessionLockedDialogProps) {
  const copy = learnAssessmentMessages.sessionLocked

  return (
    <Dialog open={open}>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" disabled={retrying} onClick={onRetry}>
            {copy.retryAction}
          </Button>
          <Button disabled={retrying} onClick={onTakeOver}>
            {copy.takeOverAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
