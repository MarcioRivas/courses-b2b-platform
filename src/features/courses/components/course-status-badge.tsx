import { Badge } from "@/components/ui/badge"
import { courseMessages } from "@/lib/messages/admin-courses"
import type { CourseStatus } from "../types"

const VARIANT: Record<CourseStatus, "warning" | "success" | "outline"> = {
  DRAFT: "warning",
  PUBLISHED: "success",
  ARCHIVED: "outline",
}

export function CourseStatusBadge({ status }: { status: CourseStatus }) {
  return <Badge variant={VARIANT[status]}>{courseMessages.status[status]}</Badge>
}
