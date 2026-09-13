"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { groupMessages } from "@/lib/messages/admin-groups"
import { removeGroupMemberSchema, type RemoveGroupMemberInput } from "../schemas/group-schemas"

/** Thin wrapper over `remove_group_member` (D24). The RPC audits `group.member_removed` itself. */
export async function removeGroupMember(input: RemoveGroupMemberInput): Promise<ActionResult<void>> {
  const parsed = removeGroupMemberSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  // The RPC returns void and exits quietly when the row is already gone, so
  // confirm the membership exists first — otherwise the UI shows a success
  // toast for a removal that did nothing.
  const { data: existing } = await supabase
    .from("group_members")
    .select("id")
    .eq("group_id", parsed.data.groupId)
    .eq("user_id", parsed.data.userId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: groupMessages.errors.memberNotInGroup }
  }

  const { error } = await supabase.rpc("remove_group_member", {
    p_group: parsed.data.groupId,
    p_user: parsed.data.userId,
  })

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  revalidatePath(`/admin/groups/${parsed.data.groupId}`)

  return { ok: true, data: undefined }
}
