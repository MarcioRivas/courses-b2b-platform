"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { setAssessmentQuestionsSchema, type SetAssessmentQuestionsInput } from "../schemas/assessment-schemas"

/**
 * Replace-all write (5B step 3): the fixed question list itself is delete +
 * insert atomically via the `set_assessment_questions` RPC (M2 fix), which
 * also re-validates every question id belongs to a bank the caller can edit
 * and is active — closing a gap the table's RLS alone did not cover. The
 * random-bank config columns on `assessments` are a separate, independently
 * nullable update — one assessment can combine a fixed core with a random
 * top-up.
 */
export async function setAssessmentQuestions(input: SetAssessmentQuestionsInput): Promise<ActionResult<void>> {
  const parsed = setAssessmentQuestionsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from("assessments")
    .select("id, course_id, organization_id")
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  if (!assessment) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditCourse(assessment.course_id))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { randomBankId, randomCount } = parsed.data
  if (randomBankId && randomCount) {
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("question_bank_id", randomBankId)
      .eq("is_active", true)

    if ((count ?? 0) < randomCount) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.assessments.randomConfig.countExceedsActive }
    }
  }

  const { error: setError } = await supabase.rpc("set_assessment_questions", {
    p_assessment: assessment.id,
    p_items: parsed.data.fixedQuestions.map((question, index) => ({
      question_id: question.questionId,
      position: index + 1,
      points: question.points,
    })),
  })
  if (setError) {
    return { ok: false, ...toActionError(setError) }
  }

  const { error: updateError } = await supabase
    .from("assessments")
    .update({
      question_bank_id: randomBankId ?? null,
      random_question_count: randomBankId ? (randomCount ?? null) : null,
    })
    .eq("id", assessment.id)

  if (updateError) {
    return { ok: false, ...toActionError(updateError) }
  }

  await logAudit({
    organizationId: assessment.organization_id,
    action: "assessment.questions_set",
    entityType: "assessment",
    entityId: assessment.id,
    metadata: { fixedCount: parsed.data.fixedQuestions.length, randomBankId: randomBankId ?? null, randomCount: randomCount ?? null },
  })

  revalidatePath(`/teach/courses/${assessment.course_id}/assessments/${assessment.id}`)

  return { ok: true, data: undefined }
}
