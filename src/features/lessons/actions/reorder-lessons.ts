"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { reorderLessonsSchema, type ReorderLessonsInput } from "../schemas/lesson-schemas"

/** The RPC writes the audit row itself (L10/M1) — do not re-add `logAudit` here. */
export async function reorderLessons(input: ReorderLessonsInput): Promise<ActionResult<void>> {
  const parsed = reorderLessonsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: offeringId } = await supabase.rpc("offering_id_of_module", { p_module: parsed.data.moduleId })

  const { error } = await supabase.rpc("reorder_lessons", {
    p_module: parsed.data.moduleId,
    p_ordered_ids: parsed.data.orderedIds,
  })

  if (error) {
    if (error.code === "22023") {
      return { ok: false, code: "VALIDATION", message: contentMessages.errors.orderedListMismatch }
    }
    return { ok: false, ...toActionError(error) }
  }

  if (offeringId) {
    await revalidateOfferingContent(offeringId)
  }

  return { ok: true, data: undefined }
}
