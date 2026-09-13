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
    <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-destructive/30 bg-destructive/5 p-8 text-center">
      <OctagonAlertIcon className="size-8 text-destructive" />
      <p className="text-sm font-medium">{title}</p>
      {description && <p className="text-sm text-muted-foreground">{description}</p>}
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          {messages.common.retry}
        </Button>
      )}
    </div>
  )
}
