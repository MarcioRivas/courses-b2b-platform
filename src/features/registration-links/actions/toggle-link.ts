"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import { resolveAdminOrgScope } from "@/lib/auth/resolve-admin-org-scope"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { adminLinksMessages } from "@/lib/messages/admin-links"
import { toggleLinkSchema, type ToggleLinkInput } from "../schemas/link-schemas"

/**
 * Activates/deactivates a link via a direct table update — `organization_registration_links`
 * keeps an admin write policy (unlike the D24 no-direct-write tables). Never
 * logs the token, only the link id (security note in the phase brief).
 */
export async function toggleRegistrationLink(input: ToggleLinkInput): Promise<ActionResult<null>> {
  const parsed = toggleLinkSchema.safeParse(input)
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
    .update({ is_active: parsed.data.isActive })
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
    action: "registration_link.toggled",
    entityType: "organization_registration_link",
    entityId: parsed.data.linkId,
    metadata: { is_active: parsed.data.isActive },
  })

  revalidatePath("/admin/links")
  revalidatePath(`/platform/organizations/${parsed.data.organizationId}`)

  return { ok: true, data: null }
}
