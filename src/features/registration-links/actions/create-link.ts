"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import { resolveAdminOrgScope } from "@/lib/auth/resolve-admin-org-scope"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { adminLinksMessages } from "@/lib/messages/admin-links"
import { DEFAULT_TIME_ZONE, endOfDayInTimeZone } from "@/lib/dates/end-of-day-in-time-zone"
import { createLinkSchema, type CreateLinkInput } from "../schemas/link-schemas"

interface CreatedLink {
  id: string
  token: string
}

/**
 * Creates a registration link via `create_registration_link` (P2 RPC). The
 * RPC re-derives/validates the org and the ADMIN-role restriction itself
 * (D23/D25) — the checks below are defence in depth plus the platform-admin
 * explicit-org carve-out for the `/platform/organizations/[orgId]` tabs.
 */
export async function createRegistrationLink(input: CreateLinkInput): Promise<ActionResult<CreatedLink>> {
  const parsed = createLinkSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await getSessionContext()
  const scope = resolveAdminOrgScope(ctx, parsed.data.organizationId)
  if (!scope.ok) {
    return { ok: false, code: scope.code, message: messages.errors[scope.code] }
  }

  // `scope.ok` proves ctx is non-null; ADMIN links stay platform-admin-only (D23).
  if (parsed.data.role === "ADMIN" && !ctx?.isPlatformAdmin) {
    return { ok: false, code: "FORBIDDEN", message: adminLinksMessages.errors.adminRoleForbidden }
  }

  // Date input is `YYYY-MM-DD`; the link stays valid through the end of that
  // day in the organization's timezone (C16). Parsing the bare string would
  // instead use the SERVER's zone, so a UTC host would expire a Montevideo
  // link three hours early.
  const supabase = await createClient()

  // A platform admin acting on an org they are not a member of cannot read
  // `organization_settings` (its SELECT policy is is_org_member), so fall back
  // to the same default the settings row is created with.
  const { data: settings } = await supabase
    .from("organization_settings")
    .select("timezone")
    .eq("organization_id", parsed.data.organizationId)
    .maybeSingle()

  const expiresAt = endOfDayInTimeZone(parsed.data.expiresAt, settings?.timezone ?? DEFAULT_TIME_ZONE)

  const { data, error } = await supabase.rpc("create_registration_link", {
    p_org: parsed.data.organizationId,
    p_label: parsed.data.label,
    p_role: parsed.data.role,
    p_expires_at: expiresAt,
  })

  if (error) {
    if (error.code === "42501" && error.message.includes("ADMIN registration links")) {
      return { ok: false, code: "FORBIDDEN", message: adminLinksMessages.errors.adminRoleForbidden }
    }
    if (error.code === "22023") {
      // The RPC raises 22023 for two different situations; only one of them is
      // about the date the admin just picked.
      const message = error.message.includes("Organization is not active")
        ? adminLinksMessages.errors.orgInactive
        : adminLinksMessages.errors.expiryInPast
      return { ok: false, code: "VALIDATION", message }
    }
    return { ok: false, ...toActionError(error) }
  }

  const link = data?.[0]
  if (!link) {
    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  // `registration_link.created` is audited inside the RPC — never double-log (D28).
  revalidatePath("/admin/links")
  revalidatePath(`/platform/organizations/${parsed.data.organizationId}`)

  return { ok: true, data: { id: link.id, token: link.token } }
}
