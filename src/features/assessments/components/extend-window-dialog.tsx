"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import { extendWindow } from "../actions/extend-window"
import { utcIsoToLocalDateTimeInput } from "../lib/local-datetime"

interface ExtendWindowDialogProps {
  assessmentId: string
  currentUntil: string | null
  timeZone: string
}

/** Exam-day incident dialog (D32): admins/professors only, EXAM must be PUBLISHED (enforced by the RPC). */
export function ExtendWindowDialog({ assessmentId, currentUntil, timeZone }: ExtendWindowDialogProps) {
  const [open, setOpen] = useState(false)
  const [newUntil, setNewUntil] = useState(utcIsoToLocalDateTimeInput(currentUntil, timeZone))
  const [isPending, startTransition] = useTransition()
  const labels = teachAssessmentMessages.assessments.extendWindow

  function handleConfirm() {
    startTransition(async () => {
      const result = await extendWindow({ assessmentId, newUntil })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(labels.extended)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button variant="outline">{labels.trigger}</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-1.5">
          <Label>{labels.newUntilLabel}</Label>
          <Input type="datetime-local" value={newUntil} onChange={(e) => setNewUntil(e.target.value)} />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {messages.common.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? messages.common.loading : labels.confirmAction}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
