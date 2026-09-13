"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { setQuestionActiveSchema, type SetQuestionActiveInput } from "../schemas/question-schemas"

/**
 * Deactivate instead of delete (5A step 2, C10): a question referenced by
 * `assessment_questions` cannot be hard-deleted (FK RESTRICT), so authoring
 * only ever flips `is_active` — this action never issues a DELETE.
 */
export async function setQuestionActive(input: SetQuestionActiveInput): Promise<ActionResult<void>> {
  const parsed = setQuestionActiveSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("questions")
    .select("id, organization_id, question_bank_id")
    .eq("id", parsed.data.questionId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { error } = await supabase
    .from("questions")
    .update({ is_active: parsed.data.isActive })
    .eq("id", existing.id)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: existing.organization_id,
    action: parsed.data.isActive ? "question.reactivated" : "question.deactivated",
    entityType: "question",
    entityId: existing.id,
  })

  revalidatePath(`/teach/banks/${existing.question_bank_id}`)

  return { ok: true, data: undefined }
}
