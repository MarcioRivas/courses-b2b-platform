"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import { resolveAdminOrgScope } from "@/lib/auth/resolve-admin-org-scope"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { adminMembersMessages } from "@/lib/messages/admin-members"
import { setMemberStatusSchema, type SetMemberStatusInput } from "../schemas/user-schemas"

/**
 * Thin wrapper over `set_membership_status` (P1 RPC, D24). Setting `INACTIVE`
 * also cancels the member's ACTIVE enrollments inside the RPC (D29) — the
 * confirm dialog copy (member-status-toggle.tsx) states this explicitly.
 */
export async function setMemberStatus(input: SetMemberStatusInput): Promise<ActionResult<null>> {
  const parsed = setMemberStatusSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await getSessionContext()
  const scope = resolveAdminOrgScope(ctx, parsed.data.organizationId)
  if (!scope.ok) {
    return { ok: false, code: scope.code, message: messages.errors[scope.code] }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_membership_status", {
    p_membership: parsed.data.membershipId,
    p_status: parsed.data.status,
  })

  if (error) {
    if (error.code === "22023") {
      const isSelf = error.message.includes("own membership")
      return {
        ok: false,
        code: "CONFLICT",
        message: isSelf ? adminMembersMessages.errors.selfStatusChange : adminMembersMessages.errors.lastAdminStatus,
      }
    }
    return { ok: false, ...toActionError(error) }
  }

  // `member.status_changed` is audited inside the RPC — never double-log (D28).
  revalidatePath("/admin/members")
  revalidatePath(`/platform/organizations/${parsed.data.organizationId}`)

  return { ok: true, data: null }
}
