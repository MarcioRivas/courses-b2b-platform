import { createClient } from "@/lib/supabase/server"
import type { QuestionDetail } from "../types"

/**
 * Returns full detail (incl. options) rather than a slim list item: the bank
 * detail page renders every question inline and the edit dialog needs the
 * options to prefill without a second round trip per row.
 */
export async function listQuestions(bankId: string): Promise<QuestionDetail[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("questions")
    .select(
      "id, question_bank_id, organization_id, type, prompt, default_points, is_active, question_options(id, label, position, is_correct)"
    )
    .eq("question_bank_id", bankId)
    .order("created_at", { ascending: false })

  if (error) {
    return []
  }

  return (data ?? []).map((question) => ({
    id: question.id,
    questionBankId: question.question_bank_id,
    organizationId: question.organization_id,
    type: question.type,
    prompt: question.prompt,
    defaultPoints: Number(question.default_points),
    isActive: question.is_active,
    options: [...(question.question_options ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((option) => ({ id: option.id, label: option.label, position: option.position, isCorrect: option.is_correct })),
  }))
}
