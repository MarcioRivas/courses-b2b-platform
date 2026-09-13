import { createClient } from "@/lib/supabase/server"
import type { QuestionOptionForPicker } from "@/features/questions/types"

export interface AssessmentBankOption {
  id: string
  name: string
  activeQuestionCount: number
}

export interface AssessmentConfigOptions {
  banks: AssessmentBankOption[]
  questions: QuestionOptionForPicker[]
}

/**
 * Everything the assessment config UI needs to build a question source
 * (5B step 3): banks and active questions editable for this course — the
 * org-wide banks (`course_id is null`) plus this course's own banks. RLS
 * (`can_edit_question_bank`) already limits this to what the caller may use.
 */
export async function getAssessmentConfigOptions(courseId: string): Promise<AssessmentConfigOptions> {
  const supabase = await createClient()

  const { data: banks, error: banksError } = await supabase
    .from("question_banks")
    .select("id, name, questions(id, is_active)")
    .or(`course_id.eq.${courseId},course_id.is.null`)

  if (banksError) {
    return { banks: [], questions: [] }
  }

  const bankRows = banks ?? []
  const bankOptions: AssessmentBankOption[] = bankRows.map((bank) => ({
    id: bank.id,
    name: bank.name,
    activeQuestionCount: (bank.questions ?? []).filter((q) => q.is_active).length,
  }))

  const bankIds = bankRows.map((b) => b.id)
  if (bankIds.length === 0) {
    return { banks: bankOptions, questions: [] }
  }

  const { data: questions, error: questionsError } = await supabase
    .from("questions")
    .select("id, prompt, default_points, question_bank_id, question_banks(name)")
    .in("question_bank_id", bankIds)
    .eq("is_active", true)
    .order("created_at", { ascending: false })

  if (questionsError) {
    return { banks: bankOptions, questions: [] }
  }

  const questionOptions: QuestionOptionForPicker[] = (questions ?? []).map((q) => ({
    id: q.id,
    bankId: q.question_bank_id,
    bankName: q.question_banks?.name ?? "",
    prompt: q.prompt,
    defaultPoints: Number(q.default_points),
  }))

  return { banks: bankOptions, questions: questionOptions }
}
