"use client"

import { OctagonAlertIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"

interface ErrorStateProps {
  title: string
  description?: string
  onRetry?: () => void
}

export function ErrorState({ title, description, onRetry }: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-destructive/30 bg-card/60 p-10 text-center">
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-2xl bg-destructive/10 text-destructive"
      >
        <OctagonAlertIcon className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {messages.common.retry}
        </Button>
      )}
    </div>
  )
}
