"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { groupMessages } from "@/lib/messages/admin-groups"
import { deleteGroupSchema, type DeleteGroupInput } from "../schemas/group-schemas"

/** Maps `23503` (FK RESTRICT from `course_offerings.group_id`, Phase 3) to a readable CONFLICT. */
export async function deleteGroup(input: DeleteGroupInput): Promise<ActionResult<void>> {
  const parsed = deleteGroupSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("groups")
    .delete()
    .eq("id", parsed.data.groupId)
    .eq("organization_id", ctx.organizationId)
    .select("id")

  if (error) {
    if (error.code === "23503") {
      return { ok: false, code: "CONFLICT", message: groupMessages.errors.deleteConflict }
    }
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "group.deleted",
    entityType: "group",
    entityId: parsed.data.groupId,
  })

  revalidatePath("/admin/groups")

  return { ok: true, data: undefined }
}
