"use client"

import { useState, useTransition, type ReactElement } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import type { ActionResult } from "@/lib/errors"
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

interface ConfirmDialogProps<TInput> {
  /** Element that opens the dialog (a Button, a menu item…). */
  trigger: ReactElement
  title: string
  description: string
  confirmLabel: string
  destructive?: boolean
  successMessage?: string
  /**
   * The Server Action to run on confirm, plus its payload. Deliberately NOT a
   * bound closure: a Server Component may only hand a Client Component a
   * reference to a `"use server"` function and serializable data, so an inline
   * `() => action(x)` throws at render time. Splitting the two keeps this
   * dialog usable from Server and Client Components alike.
   */
  action: (input: TInput) => Promise<ActionResult<unknown>>
  input: TInput
}

/**
 * Shared confirmation gate for destructive or irreversible admin mutations.
 * Keeps every screen's error/toast handling identical.
 */
export function ConfirmDialog<TInput>({
  trigger,
  title,
  description,
  confirmLabel,
  destructive = false,
  successMessage,
  action,
  input,
}: ConfirmDialogProps<TInput>) {
  const [open, setOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function handleConfirm() {
    startTransition(async () => {
      const result = await action(input)

      if (!result.ok) {
        toast.error(result.message)
        return
      }

      if (successMessage) {
        toast.success(successMessage)
      }
      setOpen(false)
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={trigger} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={isPending}>
            {messages.common.cancel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={isPending}
          >
            {isPending ? messages.common.loading : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
