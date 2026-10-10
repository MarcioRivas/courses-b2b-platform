"use client"

import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"
import { CheckIcon, CircleIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { learnMessages } from "@/lib/messages/learn"
import { toggleBlockCompletion } from "../actions/toggle-block-completion"

const ICON = "absolute inset-0 size-4 transition-[opacity,scale,filter] duration-180 ease-out-quint"
const ICON_HIDDEN = "scale-90 opacity-0 blur-[2px]"

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
        "inline-flex items-center gap-2 self-start rounded-md border px-3 py-1.5 text-sm font-medium transition-[background-color,border-color,color,scale] duration-150 ease-out-quint focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring active:scale-[0.97] disabled:opacity-60",
        completed ? "border-success/40 bg-success-soft text-success" : "hover:bg-muted"
      )}
    >
      {/* Both icons stay mounted and cross-fade (opacity + scale + blur), so the
          change reads even at a glance. Collapsed under reduced motion. */}
      <span className="relative size-4" aria-hidden>
        <CircleIcon className={cn(ICON, completed && ICON_HIDDEN)} />
        <CheckIcon className={cn(ICON, "stroke-3", !completed && ICON_HIDDEN)} />
      </span>
      {completed ? learnMessages.lesson.markedComplete : learnMessages.lesson.markComplete}
    </button>
  )
}
