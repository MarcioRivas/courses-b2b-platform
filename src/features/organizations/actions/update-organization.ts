"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { updateOrganizationSchema, type UpdateOrganizationInput } from "../schemas/organization-schemas"

/**
 * Platform-only rename. `organizationId` is explicit because this screen is
 * reached only from `/platform/organizations/[orgId]` (D23) — `requirePlatformAdmin`
 * plus the `organizations_update` RLS policy both gate the write.
 */
export async function updateOrganization(input: UpdateOrganizationInput): Promise<ActionResult<void>> {
  const parsed = updateOrganizationSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  await requirePlatformAdmin()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("organizations")
    .update({ name: parsed.data.name })
    .eq("id", parsed.data.organizationId)
    .select("id")

  if (error) {
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: parsed.data.organizationId,
    action: "organization.updated",
    entityType: "organization",
    entityId: parsed.data.organizationId,
    metadata: { name: parsed.data.name },
  })

  revalidatePath(`/platform/organizations/${parsed.data.organizationId}`)
  revalidatePath("/platform/organizations")

  return { ok: true, data: undefined }
}
