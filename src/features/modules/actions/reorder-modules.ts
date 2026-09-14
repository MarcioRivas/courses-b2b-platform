"use server"

import { revalidateCourseContent } from "@/lib/courses/revalidate-course-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { reorderModulesSchema, type ReorderModulesInput } from "../schemas/module-schemas"

/**
 * Wraps `reorder_modules`: one call, the full ordered id list (partial lists
 * are rejected server-side). The RPC itself writes the audit row (L10) — it
 * has the course's organization in hand, so a dual-role platform admin
 * reordering another org's course still attributes the row to that org, not
 * the caller's own (M1). Do not re-add `logAudit` here.
 */
export async function reorderModules(input: ReorderModulesInput): Promise<ActionResult<void>> {
  const parsed = reorderModulesSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { error } = await supabase.rpc("reorder_modules", {
    p_course: parsed.data.courseId,
    p_ordered_ids: parsed.data.orderedIds,
  })

  if (error) {
    if (error.code === "22023") {
      return { ok: false, code: "VALIDATION", message: contentMessages.errors.orderedListMismatch }
    }
    return { ok: false, ...toActionError(error) }
  }

  revalidateCourseContent(parsed.data.courseId)

  return { ok: true, data: undefined }
}
