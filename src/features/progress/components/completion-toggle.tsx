"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckIcon, CircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { learnMessages } from "@/lib/messages/learn"
import { toggleBlockCompletion } from "../actions/toggle-block-completion"

interface CompletionToggleProps {
  enrollmentId: string
  blockId: string
  initialCompleted: boolean
}

/**
 * Optimistic per-block completion (§53: a failure is always visible, never
 * silent — the tick rolls back and a toast explains why).
 *
 * The button is never disabled by client-side availability rules: whether the
 * module is open is the server's answer, and removing this component entirely
 * still ends in a `MODULE_LOCKED` rejection from `complete_content_block`.
 */
export function CompletionToggle({ enrollmentId, blockId, initialCompleted }: CompletionToggleProps) {
  const [completed, setCompleted] = useState(initialCompleted)
  const [isPending, startTransition] = useTransition()
  const router = useRouter()

  function toggle() {
    const next = !completed
    setCompleted(next)

    startTransition(async () => {
      const result = await toggleBlockCompletion({ enrollmentId, blockId, completed: next })

      if (!result.ok) {
        setCompleted(!next)
        toast.error(result.message)
        return
      }

      // Keeps the course header's progress bar and the module chips in step
      // with the cache the RPC just rewrote.
      router.refresh()
    })
  }

  return (
    <button
      type="button"
      aria-pressed={completed}
      disabled={isPending}
      onClick={toggle}
      className={cn(
        "inline-flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-60",
        completed ? "border-primary bg-primary/10 text-primary" : "hover:bg-muted"
      )}
    >
      {completed ? (
        <CheckIcon className="size-4" aria-hidden />
      ) : (
        <CircleIcon className="size-4" aria-hidden />
      )}
      {completed ? learnMessages.lesson.markedComplete : learnMessages.lesson.markComplete}
    </button>
  )
}
