"use client"

import { useState } from "react"
import { cn } from "@/lib/utils"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import type { TimerWarningLevel } from "../lib/compute-remaining"

interface AttemptTimerProps {
  remainingMs: number | null
  warningLevel: TimerWarningLevel
}

function formatRemaining(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${minutes}:${seconds.toString().padStart(2, "0")}`
}

/**
 * Displays remaining time and announces the 5-min/1-min thresholds once each
 * via `aria-live="polite"` (§54) — the visible countdown itself is not
 * announced every tick, only the threshold crossings.
 */
export function AttemptTimer({ remainingMs, warningLevel }: AttemptTimerProps) {
  const copy = learnAssessmentMessages.timer
  const [announcement, setAnnouncement] = useState("")
  const [announcedLevel, setAnnouncedLevel] = useState<TimerWarningLevel>("none")

  // Adjusting state during render (not in an effect) when a derived value
  // changes: the sanctioned alternative to a `useEffect` that just mirrors one
  // piece of state into another — see "You Might Not Need an Effect" in the
  // React docs. This re-renders once immediately, with no extra effect tick.
  if (warningLevel !== announcedLevel) {
    setAnnouncedLevel(warningLevel)
    if (warningLevel === "5min") {
      setAnnouncement(copy.warningFiveMinutes)
    } else if (warningLevel === "1min") {
      setAnnouncement(copy.warningOneMinute)
    } else if (warningLevel === "expired") {
      setAnnouncement(copy.expired)
    }
  }

  if (remainingMs === null) {
    return <p className="text-sm text-muted-foreground">{copy.noLimit}</p>
  }

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-medium tabular-nums transition-colors duration-200 ease-out-quint",
        warningLevel === "1min" || warningLevel === "expired"
          ? "border-destructive/40 bg-destructive/10 text-red-700 dark:text-red-400"
          : warningLevel === "5min"
            ? "border-amber-400/50 bg-amber-50 text-amber-800 dark:bg-amber-950/30 dark:text-amber-300"
            : "border-transparent bg-brand-soft text-sky-800 dark:bg-sky-950/40 dark:text-sky-300"
      )}
    >
      <span>{copy.label}:</span>
      <span>{formatRemaining(remainingMs)}</span>
      <span className="sr-only" aria-live="polite" role="status">
        {announcement}
      </span>
    </div>
  )
}
