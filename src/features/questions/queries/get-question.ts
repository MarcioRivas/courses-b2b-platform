import { createClient } from "@/lib/supabase/server"
import type { QuestionDetail } from "../types"

export async function getQuestion(questionId: string): Promise<QuestionDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("questions")
    .select(
      "id, question_bank_id, organization_id, type, prompt, default_points, is_active, question_options(id, label, position, is_correct)"
    )
    .eq("id", questionId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    id: data.id,
    questionBankId: data.question_bank_id,
    organizationId: data.organization_id,
    type: data.type,
    prompt: data.prompt,
    defaultPoints: Number(data.default_points),
    isActive: data.is_active,
    options: [...(data.question_options ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((option) => ({
        id: option.id,
        label: option.label,
        position: option.position,
        isCorrect: option.is_correct,
      })),
  }
}
