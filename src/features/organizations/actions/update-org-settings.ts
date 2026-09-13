"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { settingsMessages } from "@/lib/messages/admin-settings"
import { orgSettingsSchema, type OrgSettingsInput } from "../schemas/organization-schemas"

/** Org admin only, always the session org (never platform-scoped — see decisions.md note on is_org_member gating). */
export async function updateOrgSettings(input: OrgSettingsInput): Promise<ActionResult<void>> {
  const parsed = orgSettingsSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  const ctx = await requireOrgRole(["ADMIN"])

  const supabase = await createClient()
  // `select()` turns this into a row-returning update: without it a policy
  // that filtered every row still reports success, and the audit entry would
  // then claim a change that never happened.
  const { data, error } = await supabase
    .from("organization_settings")
    .update({
      timezone: parsed.data.timezone,
      default_passing_score: parsed.data.defaultPassingScore,
    })
    .eq("organization_id", ctx.organizationId)
    .select("organization_id")
    .maybeSingle()

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  if (!data) {
    return { ok: false, code: "NOT_FOUND", message: settingsMessages.errors.notFound }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "org_settings.updated",
    entityType: "organization_settings",
    entityId: ctx.organizationId,
    metadata: { timezone: parsed.data.timezone, defaultPassingScore: parsed.data.defaultPassingScore },
  })

  revalidatePath("/admin/settings")

  return { ok: true, data: undefined }
}
