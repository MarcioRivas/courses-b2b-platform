"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import { resolveAdminOrgScope } from "@/lib/auth/resolve-admin-org-scope"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { adminLinksMessages } from "@/lib/messages/admin-links"
import { revokeLinkSchema, type RevokeLinkInput } from "../schemas/link-schemas"

/** Sets `revoked_at` (irreversible — the UI gates this behind a `ConfirmDialog`). */
export async function revokeRegistrationLink(input: RevokeLinkInput): Promise<ActionResult<null>> {
  const parsed = revokeLinkSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await getSessionContext()
  const scope = resolveAdminOrgScope(ctx, parsed.data.organizationId)
  if (!scope.ok) {
    return { ok: false, code: scope.code, message: messages.errors[scope.code] }
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("organization_registration_links")
    .update({ revoked_at: new Date().toISOString(), is_active: false })
    .eq("id", parsed.data.linkId)
    .eq("organization_id", parsed.data.organizationId)
    .select("id")
    .maybeSingle()

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  // RLS filters a link of another org out entirely, so "no row" is a
  // permission/not-found case, not an internal failure.
  if (!data) {
    return { ok: false, code: "NOT_FOUND", message: adminLinksMessages.errors.notFound }
  }

  await logAudit({
    organizationId: parsed.data.organizationId,
    action: "registration_link.revoked",
    entityType: "organization_registration_link",
    entityId: parsed.data.linkId,
  })

  revalidatePath("/admin/links")
  revalidatePath(`/platform/organizations/${parsed.data.organizationId}`)

  return { ok: true, data: null }
}
