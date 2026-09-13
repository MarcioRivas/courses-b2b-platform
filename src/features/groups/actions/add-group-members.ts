"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { groupMessages } from "@/lib/messages/admin-groups"
import { addGroupMembersSchema, type AddGroupMembersInput } from "../schemas/group-schemas"

/**
 * Thin wrapper over `add_group_members` (D24 — never a direct insert into
 * `group_members`). The RPC audits `group.member_added` itself; this action
 * must not double-log. It also raises a bare `P0001` (no explicit errcode)
 * from the `assert_active_member_of_org` trigger for a non-ACTIVE-STUDENT or
 * cross-org target — `toActionError` has no mapping for that code and would
 * otherwise leak the raw Postgres text, so it's caught explicitly here.
 * The RPC is idempotent: it returns the count actually inserted, which may
 * be less than `userIds.length` when some were already members.
 */
export async function addGroupMembers(
  input: AddGroupMembersInput
): Promise<ActionResult<{ added: number }>> {
  const parsed = addGroupMembersSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("add_group_members", {
    p_group: parsed.data.groupId,
    p_user_ids: parsed.data.userIds,
  })

  if (error) {
    // P0001 is the default code for any errcode-less RAISE in the call stack,
    // so match the trigger's own message rather than treating every internal
    // failure as a bad member selection.
    if (error.code === "P0001" && error.message.includes("does not have an ACTIVE")) {
      return { ok: false, code: "CONFLICT", message: groupMessages.errors.invalidMember }
    }
    return { ok: false, ...toActionError(error) }
  }

  revalidatePath(`/admin/groups/${parsed.data.groupId}`)

  return { ok: true, data: { added: data ?? 0 } }
}
