"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import { resolveAdminOrgScope } from "@/lib/auth/resolve-admin-org-scope"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { adminMembersMessages } from "@/lib/messages/admin-members"
import { updateMemberProfileSchema, type UpdateMemberProfileInput } from "../schemas/user-schemas"

/**
 * Thin wrapper over `admin_update_member_profile`. The RPC enforces who can be
 * edited (single-org, non-admin targets for org admins) and DNI uniqueness per
 * org, and audits `member.profile_updated` — never double-log (D28).
 */
export async function updateMemberProfile(input: UpdateMemberProfileInput): Promise<ActionResult<null>> {
  const parsed = updateMemberProfileSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await getSessionContext()
  const scope = resolveAdminOrgScope(ctx, parsed.data.organizationId)
  if (!scope.ok) {
    return { ok: false, code: scope.code, message: messages.errors[scope.code] }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("admin_update_member_profile", {
    p_user: parsed.data.userId,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_phone: parsed.data.phone,
    p_dni: parsed.data.dni,
  })

  if (error) {
    if (error.message.includes("DNI_TAKEN")) {
      return { ok: false, code: "CONFLICT", message: adminMembersMessages.errors.dniTaken }
    }
    if (error.message.includes("INVALID_PROFILE")) {
      return { ok: false, code: "VALIDATION", message: adminMembersMessages.errors.invalidProfile }
    }
    if (error.code === "42501") {
      return { ok: false, code: "FORBIDDEN", message: adminMembersMessages.errors.notAllowed }
    }
    return { ok: false, ...toActionError(error) }
  }

  revalidatePath("/admin/members")
  revalidatePath(`/admin/members/${parsed.data.userId}`)

  return { ok: true, data: null }
}
