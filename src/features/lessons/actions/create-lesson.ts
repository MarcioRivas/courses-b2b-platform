"use server"

import { revalidateCourseContent } from "@/lib/courses/revalidate-course-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createLessonSchema, type CreateLessonInput } from "../schemas/lesson-schemas"

export async function createLesson(input: CreateLessonInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createLessonSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: courseId } = await supabase.rpc("course_id_of_module", { p_module: parsed.data.moduleId })
  if (!courseId) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditCourse(courseId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { data: last } = await supabase
    .from("lessons")
    .select("position")
    .eq("module_id", parsed.data.moduleId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data, error } = await supabase
    .from("lessons")
    .insert({
      module_id: parsed.data.moduleId,
      title: parsed.data.title,
      description: parsed.data.description || null,
      position: (last?.position ?? 0) + 1,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getCourseOrganizationId(courseId),
    action: "lesson.created",
    entityType: "lesson",
    entityId: data.id,
    metadata: { title: parsed.data.title, moduleId: parsed.data.moduleId },
  })

  revalidateCourseContent(courseId)

  return { ok: true, data: { id: data.id } }
}
