"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { updateGroupSchema, type UpdateGroupInput } from "../schemas/group-schemas"

export async function updateGroup(input: UpdateGroupInput): Promise<ActionResult<void>> {
  const parsed = updateGroupSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("groups")
    .update({ name: parsed.data.name, description: parsed.data.description || null })
    .eq("id", parsed.data.groupId)
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
    action: "group.updated",
    entityType: "group",
    entityId: parsed.data.groupId,
    metadata: { name: parsed.data.name },
  })

  revalidatePath("/admin/groups")
  revalidatePath(`/admin/groups/${parsed.data.groupId}`)

  return { ok: true, data: undefined }
}
