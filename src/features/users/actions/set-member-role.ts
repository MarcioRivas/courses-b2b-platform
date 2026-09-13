"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import { resolveAdminOrgScope } from "@/lib/auth/resolve-admin-org-scope"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { adminMembersMessages } from "@/lib/messages/admin-members"
import { setMemberRoleSchema, type SetMemberRoleInput } from "../schemas/user-schemas"

/**
 * Thin wrapper over `set_membership_role` (P1 RPC) — the only write path onto
 * `organization_memberships` (D24). The RPC re-derives the org from the
 * membership row and asserts `is_org_admin` on it (D25); the check below is
 * defence in depth plus the platform-admin explicit-org carve-out (D23).
 */
export async function setMemberRole(input: SetMemberRoleInput): Promise<ActionResult<null>> {
  const parsed = setMemberRoleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await getSessionContext()
  const scope = resolveAdminOrgScope(ctx, parsed.data.organizationId)
  if (!scope.ok) {
    return { ok: false, code: scope.code, message: messages.errors[scope.code] }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("set_membership_role", {
    p_membership: parsed.data.membershipId,
    p_role: parsed.data.role,
  })

  if (error) {
    if (error.code === "22023") {
      const isSelf = error.message.includes("own membership")
      return {
        ok: false,
        code: "CONFLICT",
        message: isSelf ? adminMembersMessages.errors.selfRoleChange : adminMembersMessages.errors.lastAdminRole,
      }
    }
    return { ok: false, ...toActionError(error) }
  }

  // `member.role_changed` is audited inside the RPC — never double-log (D28).
  revalidatePath("/admin/members")
  revalidatePath(`/platform/organizations/${parsed.data.organizationId}`)

  return { ok: true, data: null }
}
