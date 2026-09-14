"use server"

import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { listAssessmentsForPicker } from "../queries/list-assessments"
import type { AssessmentPickerOption } from "../types"
import type { AssessmentKind } from "../types"

/**
 * Read-only Server Action (not a mutation) so the content-block editor — a
 * deeply nested client component with no direct RSC data path — can fetch
 * the course's QUIZ/TASK assessments on demand without threading a new prop
 * through every layer of the builder (`LessonDetailPage` is shared with the
 * admin route this feature doesn't own).
 */
export async function listAssessmentsForBlock(
  courseId: string,
  kind: AssessmentKind
): Promise<AssessmentPickerOption[]> {
  await requireOrgRole(["ADMIN", "PROFESSOR"])
  if (!(await canEditCourse(courseId))) {
    return []
  }
  return listAssessmentsForPicker(courseId, kind)
}
