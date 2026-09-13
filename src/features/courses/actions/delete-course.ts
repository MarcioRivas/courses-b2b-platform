"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { courseIdSchema, type CourseIdInput } from "../schemas/course-schemas"

/**
 * Hard delete is allowed only for a DRAFT course with zero enrollments (C10).
 * The `courses_delete` RLS policy only checks `is_org_admin`, so the DRAFT +
 * no-enrollments guard has to live here, before the delete runs.
 */
export async function deleteCourse(input: CourseIdInput): Promise<ActionResult<void>> {
  const parsed = courseIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data: course } = await supabase
    .from("courses")
    .select("id, status")
    .eq("id", parsed.data.courseId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle()

  if (!course) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  if (course.status !== "DRAFT") {
    return { ok: false, code: "CONFLICT", message: courseMessages.errors.deleteNotDraft }
  }

  const { count: enrollmentCount } = await supabase
    .from("course_enrollments")
    .select("id", { count: "exact", head: true })
    .eq("course_id", course.id)

  if ((enrollmentCount ?? 0) > 0) {
    return { ok: false, code: "CONFLICT", message: courseMessages.errors.deleteHasEnrollments }
  }

  const { error, data } = await supabase.from("courses").delete().eq("id", course.id).select("id")

  if (error) {
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "course.deleted",
    entityType: "course",
    entityId: course.id,
  })

  revalidatePath("/admin/courses")

  return { ok: true, data: undefined }
}
