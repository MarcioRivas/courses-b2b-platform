"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { updateQuestionSchema, type UpdateQuestionInput } from "../schemas/question-schemas"

/**
 * MC options are replaced wholesale (5A step 2) via the `replace_question_options`
 * RPC (M2 fix): delete + insert now happen inside one transaction server-side,
 * so a failed insert can no longer leave the question with zero options.
 */
export async function updateQuestion(input: UpdateQuestionInput): Promise<ActionResult<void>> {
  const parsed = updateQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
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

  const { question } = parsed.data

  // N4 fix (review 260913, cycle 2): the options write must land BEFORE the
  // `type` column commits. `replace_question_options` does not check `type`,
  // so calling it first and only then updating the row means a failure here
  // leaves the question exactly as it was (old type, old options) instead of
  // stranding an MC question with 0 options if the row update had already
  // committed the OPEN_ENDED -> MULTIPLE_CHOICE switch.
  if (question.type === "MULTIPLE_CHOICE") {
    const { error: optionsError } = await supabase.rpc("replace_question_options", {
      p_question: existing.id,
      p_options: question.options.map((option, index) => ({
        label: option.label,
        position: index + 1,
        is_correct: option.isCorrect,
      })),
    })
    if (optionsError) {
      return { ok: false, ...toActionError(optionsError) }
    }
  } else {
    // Switching to OPEN_ENDED: no options apply anymore.
    const { error: clearError } = await supabase.from("question_options").delete().eq("question_id", existing.id)
    if (clearError) {
      return { ok: false, ...toActionError(clearError) }
    }
  }

  const { error } = await supabase
    .from("questions")
    .update({ type: question.type, prompt: question.prompt, default_points: question.defaultPoints })
    .eq("id", existing.id)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: existing.organization_id,
    action: "question.updated",
    entityType: "question",
    entityId: existing.id,
    metadata: { type: question.type },
  })

  revalidatePath(`/teach/banks/${existing.question_bank_id}`)

  return { ok: true, data: undefined }
}
