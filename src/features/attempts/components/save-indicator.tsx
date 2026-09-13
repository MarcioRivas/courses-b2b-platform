"use client"

import { CheckIcon, LoaderCircleIcon, OctagonAlertIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import type { SaveState } from "../hooks/use-autosave"

interface SaveIndicatorProps {
  state: SaveState
  lastSavedAt: Date | null
}

function formatTime(date: Date): string {
  return date.toLocaleTimeString("es-UY", { hour: "2-digit", minute: "2-digit", second: "2-digit" })
}

/** Autosave status pill (D4): saving / saved hh:mm:ss / persistent error while retrying. */
export function SaveIndicator({ state, lastSavedAt }: SaveIndicatorProps) {
  const copy = learnAssessmentMessages.save

  if (state === "error") {
    return (
      <span className="flex items-center gap-1.5 text-sm font-medium text-destructive" role="status">
        <OctagonAlertIcon className="size-4" /> {copy.error}
      </span>
    )
  }

  if (state === "saving") {
    return (
      <span className="flex items-center gap-1.5 text-sm text-muted-foreground" role="status">
        <LoaderCircleIcon className="size-4 animate-spin" /> {copy.saving}
      </span>
    )
  }

  if (state === "saved" && lastSavedAt) {
    return (
      <span className={cn("flex items-center gap-1.5 text-sm text-muted-foreground")} role="status">
        <CheckIcon className="size-4" /> {copy.savedAtPrefix} {formatTime(lastSavedAt)}
      </span>
    )
  }

  return null
}
