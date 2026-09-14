"use server"

import { revalidateCourseContent } from "@/lib/courses/revalidate-course-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { deleteModuleSchema, type DeleteModuleInput } from "../schemas/module-schemas"

/**
 * `delete_module` raises `CONTENT_IN_USE` (SQLSTATE 23001, restrict_violation)
 * when the course is published with active enrollments or any progress exists
 * under the module (C10). That code isn't in the shared SQLSTATE map, so it's
 * translated here rather than leaking as a 500 or a generic INTERNAL error.
 */
export async function deleteModule(input: DeleteModuleInput): Promise<ActionResult<void>> {
  const parsed = deleteModuleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: courseId } = await supabase.rpc("course_id_of_module", { p_module: parsed.data.moduleId })

  const { error } = await supabase.rpc("delete_module", { p_module: parsed.data.moduleId })

  if (error) {
    if (error.code === "23001") {
      return { ok: false, code: "CONFLICT", message: contentMessages.errors.contentInUse }
    }
    return { ok: false, ...toActionError(error) }
  }

  if (courseId) {
    await logAudit({
      organizationId: await getCourseOrganizationId(courseId),
      action: "module.deleted",
      entityType: "module",
      entityId: parsed.data.moduleId,
    })
    revalidateCourseContent(courseId)
  }

  return { ok: true, data: undefined }
}
