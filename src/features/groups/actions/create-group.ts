"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { groupMessages } from "@/lib/messages/admin-groups"
import { createGroupSchema, type CreateGroupInput } from "../schemas/group-schemas"

export async function createGroup(input: CreateGroupInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createGroupSchema.safeParse(input)
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
    .insert({
      organization_id: ctx.organizationId,
      name: parsed.data.name,
      description: parsed.data.description || null,
      created_by: ctx.user.id,
    })
    .select("id")
    .single()

  if (error?.code === "23505") {
    return { ok: false, code: "CONFLICT", message: groupMessages.errors.duplicateName }
  }

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "group.created",
    entityType: "group",
    entityId: data.id,
    metadata: { name: parsed.data.name },
  })

  revalidatePath("/admin/groups")

  return { ok: true, data: { id: data.id } }
}
