"use server"

import { revalidateAssessment } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { saveAssessmentQuestionsSchema, type SaveAssessmentQuestionsInput } from "../schemas/assessment-question-schemas"

/**
 * Wizard step 2 for QUIZ/EXAM: replaces the whole question list (and the
 * random draw size) in one `save_assessment_questions` call. The RPC re-checks
 * permissions and every invariant; it returns the question ids in display
 * order so the client can rebase its drafts.
 */
export async function saveAssessmentQuestions(input: SaveAssessmentQuestionsInput): Promise<ActionResult<{ ids: string[] }>> {
  const parsed = saveAssessmentQuestionsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from("assessments")
    .select("offering_id, kind")
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  if (!assessment) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { data, error } = await supabase.rpc("save_assessment_questions", {
    p_assessment: parsed.data.assessmentId,
    p_questions: parsed.data.questions.map((question) => ({
      ...(question.id ? { id: question.id } : {}),
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      ...(question.type === "MULTIPLE_CHOICE" ? { options: question.options } : {}),
    })),
    // Omitted = NULL (no random draw).
    p_random_count: parsed.data.randomCount ?? undefined,
  })

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await revalidateAssessment(assessment.offering_id, assessment.kind, parsed.data.assessmentId)

  return { ok: true, data: { ids: data ?? [] } }
}
