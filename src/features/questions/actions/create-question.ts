"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createQuestionSchema, type CreateQuestionInput } from "../schemas/question-schemas"

export async function createQuestion(input: CreateQuestionInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createQuestionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: bank } = await supabase
    .from("question_banks")
    .select("id, organization_id")
    .eq("id", parsed.data.questionBankId)
    .maybeSingle()

  if (!bank) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { question } = parsed.data
  const { data: inserted, error } = await supabase
    .from("questions")
    .insert({
      question_bank_id: bank.id,
      organization_id: bank.organization_id,
      type: question.type,
      prompt: question.prompt,
      default_points: question.defaultPoints,
      // Inactive until its options exist: a half-created question never joins a live pool.
      is_active: false,
      created_by: ctx.user.id,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    return { ok: false, ...toActionError(error) }
  }

  if (question.type === "MULTIPLE_CHOICE") {
    const { error: optionsError } = await supabase.rpc("replace_question_options", {
      p_question: inserted.id,
      p_options: question.options.map((option, index) => ({
        label: option.label,
        position: index + 1,
        is_correct: option.isCorrect,
      })),
    })
    if (optionsError) {
      // The RPC is atomic for the options themselves, but the question row
      // was already committed by the insert above (5F/M2) — an MC question
      // must never persist without options, so undo it here.
      await supabase.from("questions").delete().eq("id", inserted.id)
      return { ok: false, ...toActionError(optionsError) }
    }
  }

  const { error: activateError } = await supabase
    .from("questions")
    .update({ is_active: true })
    .eq("id", inserted.id)
  if (activateError) {
    await supabase.from("questions").delete().eq("id", inserted.id)
    return { ok: false, ...toActionError(activateError) }
  }

  await logAudit({
    organizationId: bank.organization_id,
    action: "question.created",
    entityType: "question",
    entityId: inserted.id,
    metadata: { type: question.type, questionBankId: bank.id },
  })

  revalidatePath(`/teach/banks/${bank.id}`)

  return { ok: true, data: { id: inserted.id } }
}
