"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { updateLessonSchema, type UpdateLessonInput } from "../schemas/lesson-schemas"

export async function updateLesson(input: UpdateLessonInput): Promise<ActionResult<void>> {
  const parsed = updateLessonSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: courseId } = await supabase.rpc("course_id_of_lesson", { p_lesson: parsed.data.lessonId })
  if (!courseId) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditCourse(courseId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { error } = await supabase
    .from("lessons")
    .update({ title: parsed.data.title, description: parsed.data.description || null })
    .eq("id", parsed.data.lessonId)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getCourseOrganizationId(courseId),
    action: "lesson.updated",
    entityType: "lesson",
    entityId: parsed.data.lessonId,
    metadata: { title: parsed.data.title },
  })

  revalidatePath(`/admin/courses/${courseId}/content`)
  revalidatePath(`/teach/courses/${courseId}/content`)

  return { ok: true, data: undefined }
}
