import { Badge } from "@/components/ui/badge"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { AssessmentStatus } from "../types"

export function AssessmentStatusBadge({ status }: { status: AssessmentStatus }) {
  return (
    <Badge variant={status === "PUBLISHED" ? "success" : "warning"}>
      {teachAssessmentMessages.assessments.statuses[status]}
    </Badge>
  )
}
