"use server"

import { revalidateCourseContent } from "@/lib/courses/revalidate-course-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { deleteLessonSchema, type DeleteLessonInput } from "../schemas/lesson-schemas"

/** Same CONTENT_IN_USE (23001) translation as `delete-module` (C10). */
export async function deleteLesson(input: DeleteLessonInput): Promise<ActionResult<void>> {
  const parsed = deleteLessonSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: courseId } = await supabase.rpc("course_id_of_lesson", { p_lesson: parsed.data.lessonId })

  const { error } = await supabase.rpc("delete_lesson", { p_lesson: parsed.data.lessonId })

  if (error) {
    if (error.code === "23001") {
      return { ok: false, code: "CONFLICT", message: contentMessages.errors.contentInUse }
    }
    return { ok: false, ...toActionError(error) }
  }

  if (courseId) {
    await logAudit({
      organizationId: await getCourseOrganizationId(courseId),
      action: "lesson.deleted",
      entityType: "lesson",
      entityId: parsed.data.lessonId,
    })
    revalidateCourseContent(courseId)
  }

  return { ok: true, data: undefined }
}
