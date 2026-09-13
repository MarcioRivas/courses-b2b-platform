"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { settingsMessages } from "@/lib/messages/admin-settings"
import { scoreRangeSchema, type ScoreRangeInput } from "../schemas/organization-schemas"

/** Org admin only. Maps `23P01` (exclusion violation) to a human-readable CONFLICT. */
export async function upsertScoreRange(input: ScoreRangeInput): Promise<ActionResult<{ id: string }>> {
  const parsed = scoreRangeSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const payload = {
    organization_id: ctx.organizationId,
    label: parsed.data.label,
    min_score: parsed.data.minScore,
    max_score: parsed.data.maxScore,
    is_passing: parsed.data.isPassing,
  }

  const { data, error } = parsed.data.id
    ? await supabase
        .from("score_scale_ranges")
        .update(payload)
        .eq("id", parsed.data.id)
        .eq("organization_id", ctx.organizationId)
        .select("id")
        .single()
    : await supabase.from("score_scale_ranges").insert(payload).select("id").single()

  if (error || !data) {
    if (error?.code === "23P01") {
      return { ok: false, code: "CONFLICT", message: settingsMessages.scoreScale.overlapError }
    }
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "score_range.upserted",
    entityType: "score_scale_range",
    entityId: data.id,
    metadata: {
      label: parsed.data.label,
      minScore: parsed.data.minScore,
      maxScore: parsed.data.maxScore,
      isPassing: parsed.data.isPassing,
    },
  })

  revalidatePath("/admin/settings/score-scale")

  return { ok: true, data: { id: data.id } }
}
