"use client"

import Link from "next/link"
import { ErrorState } from "@/components/shared/error-state"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import type { AttemptErrorCode } from "../lib/errors"

interface AttemptErrorProps {
  code: AttemptErrorCode
  onRetry?: () => void
  backHref?: string
}

/** Code→copy map for every §53 error state the player/pre-flight screens can hit. */
export function AttemptError({ code, onRetry, backHref }: AttemptErrorProps) {
  const title = learnAssessmentMessages.errors[code]

  return (
    <div className="flex flex-col items-center gap-3">
      <ErrorState title={title} onRetry={onRetry} />
      {backHref && (
        <Link href={backHref} className="text-sm font-medium text-primary hover:underline">
          {learnAssessmentMessages.common.backToCourse}
        </Link>
      )}
    </div>
  )
}
