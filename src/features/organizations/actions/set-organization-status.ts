"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import {
  setOrganizationStatusSchema,
  type SetOrganizationStatusInput,
} from "../schemas/organization-schemas"

/**
 * Platform-only activate/deactivate. `is_org_member()` also requires
 * `organizations.status = 'ACTIVE'` (D29), so INACTIVE cuts off every
 * member's reads immediately — no enrollment cascade at the org level
 * (that only happens per-membership via `set_membership_status`).
 */
export async function setOrganizationStatus(
  input: SetOrganizationStatusInput
): Promise<ActionResult<void>> {
  const parsed = setOrganizationStatusSchema.safeParse(input)
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
    .update({ status: parsed.data.status })
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
    action: "organization.status_changed",
    entityType: "organization",
    entityId: parsed.data.organizationId,
    metadata: { status: parsed.data.status },
  })

  revalidatePath(`/platform/organizations/${parsed.data.organizationId}`)
  revalidatePath("/platform/organizations")

  return { ok: true, data: undefined }
}
