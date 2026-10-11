"use client"

import { useState } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import type { ActionResult } from "@/lib/errors"

interface GradePreviewDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  percent: number | null
  /** Null when no score range matches (or none is configured). */
  label: string | null
  /** Null when no score range matches: the pass badge is hidden. */
  isPassing: boolean | null
  ungradedCount: number
  onConfirm: () => Promise<ActionResult<unknown>>
}

/**
 * Preview shown before persisting a grade. Nothing is saved until
 * "Confirmar y guardar"; a failure stays inline so the grader can retry.
 */
export function GradePreviewDialog({
  open,
  onOpenChange,
  percent,
  label,
  isPassing,
  ungradedCount,
  onConfirm,
}: GradePreviewDialogProps) {
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const copy = teachGradingMessages.preview

  function handleOpenChange(next: boolean) {
    if (pending) {
      return
    }
    if (!next) {
      setError(null)
    }
    onOpenChange(next)
  }

  async function handleConfirm() {
    setPending(true)
    setError(null)
    try {
      const result = await onConfirm()
      if (result.ok) {
        onOpenChange(false)
      } else {
        setError(result.message)
      }
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col items-center gap-2 rounded-xl bg-muted p-4 text-center">
          <p className="text-xs text-muted-foreground">{copy.percentLabel}</p>
          <p className="text-4xl font-semibold" data-testid="grade-preview-percent">
            {percent === null ? copy.noPercent : `${percent}%`}
          </p>
          <p className="text-sm font-medium" data-testid="grade-preview-label">
            {label ?? copy.noScale}
          </p>
          {isPassing !== null && (
            <Badge variant={isPassing ? "success" : "destructive"}>{isPassing ? copy.passed : copy.failed}</Badge>
          )}
        </div>
        {ungradedCount > 0 && (
          <p role="status" className="text-sm text-amber-700 dark:text-amber-300">
            {copy.partialWarning(ungradedCount)}
          </p>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => handleOpenChange(false)}>
            {copy.back}
          </Button>
          <Button disabled={pending} onClick={handleConfirm}>
            {pending ? copy.confirming : error ? copy.retry : copy.confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
