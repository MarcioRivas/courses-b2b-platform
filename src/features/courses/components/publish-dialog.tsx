"use client"

import { useState, useTransition, type ReactElement } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { publishCourse } from "../actions/publish-course"

interface PublishDialogProps {
  trigger: ReactElement
  courseId: string
}

/**
 * `COURSE_INCOMPLETE` is a normal outcome, not an error toast: the dialog
 * stays open and renders the missing pieces as a checklist so the admin knows
 * exactly what to add before trying again.
 */
export function PublishDialog({ trigger, courseId }: PublishDialogProps) {
  const [open, setOpen] = useState(false)
  const [missing, setMissing] = useState<string[] | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleOpenChange(nextOpen: boolean) {
    setOpen(nextOpen)
    if (nextOpen) {
      setMissing(null)
    }
  }

  function handleConfirm() {
    startTransition(async () => {
      const result = await publishCourse({ courseId })

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      if (!result.data.published) {
        setMissing(result.data.missing ?? [])
        return
      }

      toast.success(courseMessages.publish.success)
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{courseMessages.publish.title}</DialogTitle>
          <DialogDescription>{courseMessages.publish.description}</DialogDescription>
        </DialogHeader>
        {missing && missing.length > 0 && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
            <p className="mb-2 font-medium">{courseMessages.publish.incompleteTitle}</p>
            <ul className="list-inside list-disc text-muted-foreground">
              {missing.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {messages.common.cancel}
          </Button>
          <Button onClick={handleConfirm} disabled={isPending}>
            {isPending ? messages.common.loading : courseMessages.publish.confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
