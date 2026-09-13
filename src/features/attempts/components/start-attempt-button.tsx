"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { ErrorState } from "@/components/shared/error-state"
import { startAttempt } from "../actions/start-attempt"

interface StartAttemptButtonProps {
  enrollmentId: string
  assessmentId: string
  label: string
}

/**
 * "Comenzar"/"Continuar" — the RPC itself decides which one this really is
 * (idempotent resume, D3). On success `startAttempt` redirects and this
 * component never re-renders; on failure it shows the action's own §53 copy
 * (already resolved server-side by `attemptRpcErrorResult`) inline.
 */
export function StartAttemptButton({ enrollmentId, assessmentId, label }: StartAttemptButtonProps) {
  const [isPending, startTransition] = useTransition()
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  function onSubmit() {
    setErrorMessage(null)
    startTransition(async () => {
      const result = await startAttempt({ enrollmentId, assessmentId })
      if (!result.ok) {
        setErrorMessage(result.message)
      }
    })
  }

  return (
    <div className="flex flex-col gap-3">
      <Button onClick={onSubmit} disabled={isPending}>
        {label}
      </Button>
      {errorMessage && <ErrorState title={errorMessage} onRetry={onSubmit} />}
    </div>
  )
}
