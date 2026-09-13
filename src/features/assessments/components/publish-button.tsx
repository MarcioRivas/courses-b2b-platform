"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { Button } from "@/components/ui/button"
import { publishAssessment } from "../actions/publish-assessment"

export function PublishButton({ assessmentId }: { assessmentId: string }) {
  const [isPending, startTransition] = useTransition()
  const labels = teachAssessmentMessages.assessments

  function handlePublish() {
    startTransition(async () => {
      const result = await publishAssessment({ assessmentId })
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      toast.success(labels.published)
    })
  }

  return (
    <Button onClick={handlePublish} disabled={isPending}>
      {isPending ? messages.common.loading : labels.publishAction}
    </Button>
  )
}
