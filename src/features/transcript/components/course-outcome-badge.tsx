import { Badge } from "@/components/ui/badge"
import { COURSE_OUTCOME_LABEL, type CourseOutcome } from "../types"

const VARIANT: Record<CourseOutcome, "success" | "destructive" | "brand" | "outline"> = {
  APPROVED: "success",
  FAILED: "destructive",
  IN_PROGRESS: "brand",
  CANCELLED: "outline",
}

export function CourseOutcomeBadge({ outcome }: { outcome: CourseOutcome }) {
  return <Badge variant={VARIANT[outcome]}>{COURSE_OUTCOME_LABEL[outcome]}</Badge>
}
