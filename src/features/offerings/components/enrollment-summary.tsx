"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { Button } from "@/components/ui/button"
import { syncEnrollments } from "../actions/sync-enrollments"

interface EnrollmentSummaryProps {
  offeringId: string
  enrolledCount: number
  showSync: boolean
}

/** Idempotent "Sincronizar inscripciones" escape hatch — safe to click repeatedly (D29). */
export function EnrollmentSummary({ offeringId, enrolledCount, showSync }: EnrollmentSummaryProps) {
  const [isPending, startTransition] = useTransition()

  function handleSync() {
    startTransition(async () => {
      const result = await syncEnrollments({ offeringId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(offeringMessages.enrollment.syncSuccess(result.data.affected))
    })
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-4">
      <div>
        <p className="text-sm font-medium">{offeringMessages.enrollment.title}</p>
        <p className="text-sm text-muted-foreground">{offeringMessages.enrollment.countLabel(enrolledCount)}</p>
      </div>
      {showSync && (
        <Button variant="outline" size="sm" onClick={handleSync} disabled={isPending}>
          {isPending ? messages.common.loading : offeringMessages.enrollment.syncAction}
        </Button>
      )}
    </div>
  )
}
