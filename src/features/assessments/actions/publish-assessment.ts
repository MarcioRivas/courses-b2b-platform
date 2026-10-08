"use server"

import { revalidateOfferingAssessments } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { publishAssessmentSchema, type PublishAssessmentInput } from "../schemas/assessment-schemas"

/**
 * Publish-time validation (5B step 4): at least one question source, a
 * sane window, and — for a random config — the bank still has enough
 * active questions (it may have shrunk since `setAssessmentQuestions` ran).
 * A TASK has no questions; it needs an instruction, a file limit and a deadline.
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
      "id, offering_id, organization_id, kind, instructions, max_files, duration_seconds, available_from, available_until, question_bank_id, random_question_count, assessment_questions(question_id)"
    )
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  if (!assessment) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditOffering(assessment.offering_id))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  if (assessment.kind === "TASK") {
    const taskError = taskPublishError(assessment)
    if (taskError) {
      return { ok: false, code: "VALIDATION", message: taskError }
    }
    return markPublished(supabase, assessment)
  }

  const fixedQuestionIds = (assessment.assessment_questions ?? []).map((row) => row.question_id)
  const fixedCount = fixedQuestionIds.length
  const hasRandom = assessment.question_bank_id !== null && (assessment.random_question_count ?? 0) > 0

  if (fixedCount === 0 && !hasRandom) {
    return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.noQuestionSource }
  }

  // M2 stop-gap: refuse to publish if a fixed MC question has < 2 options or
  // != 1 correct option. The authoring RPCs now enforce this on write, but a
  // question could have been left inconsistent before that migration shipped,
  // or its options table mutated directly — publish is the last gate before
  // a student can see it.
  if (fixedQuestionIds.length > 0) {
    const { data: mcQuestions } = await supabase
      .from("questions")
      .select("id, question_options(is_correct)")
      .in("id", fixedQuestionIds)
      .eq("type", "MULTIPLE_CHOICE")

    const hasInvalidMc = (mcQuestions ?? []).some((question) => {
      const options = question.question_options ?? []
      const correctCount = options.filter((option) => option.is_correct).length
      return options.length < 2 || correctCount !== 1
    })

    if (hasInvalidMc) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.mcQuestionMissingOptions }
    }
  }

  if (
    assessment.kind === "EXAM" &&
    (!assessment.duration_seconds || !assessment.available_from || !assessment.available_until)
  ) {
    return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.examRequiresWindow }
  }

  if (hasRandom) {
    const { count } = await supabase
      .from("questions")
      .select("id", { count: "exact", head: true })
      .eq("question_bank_id", assessment.question_bank_id as string)
      .eq("is_active", true)

    if ((count ?? 0) < (assessment.random_question_count ?? 0)) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.randomCountExceedsActive }
    }
  }

  return markPublished(supabase, assessment)
}

function taskPublishError(assessment: {
  instructions: string | null
  max_files: number | null
  available_until: string | null
}): string | null {
  if (!assessment.instructions?.trim()) {
    return teachAssessmentMessages.errors.taskRequiresInstructions
  }
  if (!assessment.max_files) {
    return teachAssessmentMessages.errors.taskRequiresMaxFiles
  }
  if (!assessment.available_until) {
    return teachAssessmentMessages.errors.taskRequiresDeadline
  }
  return null
}

async function markPublished(
  supabase: Awaited<ReturnType<typeof createClient>>,
  assessment: { id: string; offering_id: string; organization_id: string }
): Promise<ActionResult<void>> {
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

  await revalidateOfferingAssessments(assessment.offering_id, assessment.id)

  return { ok: true, data: undefined }
}
