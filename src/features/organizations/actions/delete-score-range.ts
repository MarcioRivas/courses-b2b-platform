"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { deleteScoreRangeSchema, type DeleteScoreRangeInput } from "../schemas/organization-schemas"

export async function deleteScoreRange(input: DeleteScoreRangeInput): Promise<ActionResult<void>> {
  const parsed = deleteScoreRangeSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("score_scale_ranges")
    .delete()
    .eq("id", parsed.data.id)
    .eq("organization_id", ctx.organizationId)
    .select("id")

  if (error) {
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "score_range.deleted",
    entityType: "score_scale_range",
    entityId: parsed.data.id,
  })

  revalidatePath("/admin/settings/score-scale")

  return { ok: true, data: undefined }
}
