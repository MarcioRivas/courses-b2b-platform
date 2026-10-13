"use client"

import { CheckIcon } from "lucide-react"
import { cn } from "@/lib/utils"

export interface StepperStep {
  id: string
  label: string
}

interface StepperProps {
  steps: StepperStep[]
  current: string
  /** Steps before `current` render as done. */
  isEnabled?: (id: string) => boolean
  onSelect?: (id: string) => void
  className?: string
}

/**
 * Numbered step indicator for multi-step forms. Steps are buttons when
 * `onSelect` is given and the step is enabled; labels collapse to the current
 * one on narrow screens.
 */
export function Stepper({ steps, current, isEnabled = () => true, onSelect, className }: StepperProps) {
  const currentIndex = steps.findIndex((step) => step.id === current)

  return (
    <ol className={cn("flex items-center gap-2", className)}>
      {steps.map((step, index) => {
        const isCurrent = index === currentIndex
        const isDone = index < currentIndex
        const enabled = isEnabled(step.id) && !isCurrent && Boolean(onSelect)

        return (
          <li key={step.id} className="flex min-w-0 flex-1 items-center gap-2 last:flex-none">
            <button
              type="button"
              disabled={!enabled}
              aria-current={isCurrent ? "step" : undefined}
              onClick={() => onSelect?.(step.id)}
              className={cn(
                "group flex min-w-0 items-center gap-2 rounded-md text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring",
                enabled ? "cursor-pointer" : "cursor-default"
              )}
            >
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-medium transition-colors",
                  isCurrent && "border-primary bg-primary text-primary-foreground",
                  isDone && "border-primary bg-primary/10 text-primary",
                  !isCurrent && !isDone && "text-muted-foreground",
                  enabled && !isCurrent && "group-hover:border-primary"
                )}
              >
                {isDone ? <CheckIcon className="size-3.5" /> : index + 1}
              </span>
              <span
                className={cn(
                  "truncate",
                  isCurrent ? "font-medium text-foreground" : "hidden text-muted-foreground sm:inline",
                  enabled && "group-hover:text-foreground"
                )}
              >
                {step.label}
              </span>
            </button>
            {index < steps.length - 1 && <span aria-hidden className="h-px min-w-4 flex-1 bg-border" />}
          </li>
        )
      })}
    </ol>
  )
}
