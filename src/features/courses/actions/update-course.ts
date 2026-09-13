"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { updateCourseSchema, type UpdateCourseInput } from "../schemas/course-schemas"

/** Access type is editable only while DRAFT — offerings derive their `kind` from it once live. */
export async function updateCourse(input: UpdateCourseInput): Promise<ActionResult<void>> {
  const parsed = updateCourseSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("courses")
    .select("status, access_type")
    .eq("id", parsed.data.courseId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  if (existing.status !== "DRAFT" && existing.access_type !== parsed.data.accessType) {
    return { ok: false, code: "CONFLICT", message: courseMessages.errors.accessTypeLocked }
  }

  const { data, error } = await supabase
    .from("courses")
    .update({
      title: parsed.data.title,
      description: parsed.data.description || null,
      access_type: parsed.data.accessType,
    })
    .eq("id", parsed.data.courseId)
    .eq("organization_id", ctx.organizationId)
    .select("id")

  if (error) {
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "course.updated",
    entityType: "course",
    entityId: parsed.data.courseId,
    metadata: { title: parsed.data.title, accessType: parsed.data.accessType },
  })

  revalidatePath("/admin/courses")
  revalidatePath(`/admin/courses/${parsed.data.courseId}`)

  return { ok: true, data: undefined }
}
