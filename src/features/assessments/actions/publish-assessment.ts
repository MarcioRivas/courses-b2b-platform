"use server"

import { revalidateAssessment } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { publishAssessmentSchema, type PublishAssessmentInput } from "../schemas/assessment-schemas"
import { publishChecklist, type PublishCheckKey } from "../lib/publish-checklist"

const CHECK_ERRORS: Record<PublishCheckKey, string> = {
  hasQuestions: teachAssessmentMessages.errors.noQuestions,
  randomFits: teachAssessmentMessages.errors.randomCountExceeds,
  examWindow: teachAssessmentMessages.errors.examRequiresWindow,
  taskInstructions: teachAssessmentMessages.errors.taskRequiresInstructions,
  taskDeadline: teachAssessmentMessages.errors.taskRequiresDeadline,
}

/**
 * DRAFT → PUBLISHED. Same rules the wizard's review step shows
 * (`publishChecklist`), re-checked against the stored row. MC option shape is
 * already guaranteed by `save_assessment_questions`.
 */
export async function publishAssessment(input: PublishAssessmentInput): Promise<ActionResult<void>> {
  const parsed = publishAssessmentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: assessment } = await supabase
    .from("assessments")
    .select(
      "id, offering_id, organization_id, kind, instructions, duration_seconds, available_from, available_until, random_question_count, questions(count)"
    )
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  if (!assessment) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditOffering(assessment.offering_id))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const failed = publishChecklist({
    kind: assessment.kind,
    questionCount: assessment.questions?.[0]?.count ?? 0,
    randomQuestionCount: assessment.random_question_count,
    durationSeconds: assessment.duration_seconds,
    availableFrom: assessment.available_from,
    availableUntil: assessment.available_until,
    instructions: assessment.instructions,
  }).find((check) => !check.ok)

  if (failed) {
    return { ok: false, code: "VALIDATION", message: CHECK_ERRORS[failed.key] }
  }

  const { error } = await supabase.from("assessments").update({ status: "PUBLISHED" }).eq("id", assessment.id)
  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: assessment.organization_id,
    action: "assessment.published",
    entityType: "assessment",
    entityId: assessment.id,
  })

  await revalidateAssessment(assessment.offering_id, assessment.kind, assessment.id)

  return { ok: true, data: undefined }
}
