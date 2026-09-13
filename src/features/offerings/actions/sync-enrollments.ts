"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { syncEnrollmentsSchema, type SyncEnrollmentsInput } from "../schemas/offering-schemas"

/** Idempotent escape hatch: re-running never duplicates or loses progress (D29). */
export async function syncEnrollments(input: SyncEnrollmentsInput): Promise<ActionResult<{ affected: number }>> {
  const parsed = syncEnrollmentsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data: offering } = await supabase
    .from("course_offerings")
    .select("id, course_id")
    .eq("id", parsed.data.offeringId)
    .eq("organization_id", ctx.organizationId)
    .maybeSingle()

  if (!offering) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { data: affected, error } = await supabase.rpc("sync_offering_enrollments", {
    p_offering: offering.id,
  })

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "offering.enrollments_synced",
    entityType: "course_offering",
    entityId: offering.id,
    metadata: { affected: affected ?? 0 },
  })

  revalidatePath(`/admin/courses/${offering.course_id}/offerings/${offering.id}`)

  return { ok: true, data: { affected: affected ?? 0 } }
}
