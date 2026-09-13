"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { updateBankSchema, type UpdateBankInput } from "../schemas/question-schemas"

export async function updateBank(input: UpdateBankInput): Promise<ActionResult<void>> {
  const parsed = updateBankSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("question_banks")
    .select("id, organization_id")
    .eq("id", parsed.data.bankId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { error } = await supabase
    .from("question_banks")
    .update({ name: parsed.data.name, description: parsed.data.description || null })
    .eq("id", parsed.data.bankId)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: existing.organization_id,
    action: "question_bank.updated",
    entityType: "question_bank",
    entityId: parsed.data.bankId,
    metadata: { name: parsed.data.name },
  })

  revalidatePath("/teach/banks")
  revalidatePath(`/teach/banks/${parsed.data.bankId}`)

  return { ok: true, data: undefined }
}
