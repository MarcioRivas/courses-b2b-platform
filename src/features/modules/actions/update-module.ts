"use server"

import { revalidateCourseContent } from "@/lib/courses/revalidate-course-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { updateModuleSchema, type UpdateModuleInput } from "../schemas/module-schemas"

export async function updateModule(input: UpdateModuleInput): Promise<ActionResult<void>> {
  const parsed = updateModuleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("modules")
    .select("course_id")
    .eq("id", parsed.data.moduleId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditCourse(existing.course_id))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { error } = await supabase
    .from("modules")
    .update({ title: parsed.data.title, description: parsed.data.description || null })
    .eq("id", parsed.data.moduleId)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getCourseOrganizationId(existing.course_id),
    action: "module.updated",
    entityType: "module",
    entityId: parsed.data.moduleId,
    metadata: { title: parsed.data.title },
  })

  revalidateCourseContent(existing.course_id)

  return { ok: true, data: undefined }
}
