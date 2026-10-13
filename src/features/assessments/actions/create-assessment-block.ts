"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createAssessmentBlockSchema, type CreateAssessmentBlockInput } from "../schemas/assessment-schemas"
import { configToColumns } from "../lib/assessment-config-values"
import { getAssessmentWizardContext } from "../queries/get-assessment-editor-data"

/**
 * Wizard step 1 for a QUIZ/TASK content block: creates the assessment and its
 * block together (`create_assessment_block`, one transaction — no orphans).
 * Questions / instructions come in the next step.
 */
export async function createAssessmentBlock(
  input: CreateAssessmentBlockInput
): Promise<ActionResult<{ blockId: string; assessmentId: string }>> {
  const parsed = createAssessmentBlockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }
  const { lessonId, isRequired, config } = parsed.data
  if (config.kind === "EXAM") {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: offeringId } = await supabase.rpc("offering_id_of_lesson", { p_lesson: lessonId })
  if (!offeringId) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditOffering(offeringId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { timeZone } = await getAssessmentWizardContext(await getOfferingOrganizationId(offeringId))
  const columns = configToColumns(config, timeZone)

  const { data, error } = await supabase.rpc("create_assessment_block", {
    p_lesson: lessonId,
    p_kind: config.kind,
    p_is_required: isRequired,
    p_config: {
      title: columns.title,
      description: columns.description,
      passingScore: columns.passing_score,
      maxAttempts: columns.max_attempts,
      availableFrom: columns.available_from,
      availableUntil: columns.available_until,
      maxFiles: columns.max_files,
      allowLateSubmissions: columns.allow_late_submissions,
    },
  })

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await revalidateOfferingContent(offeringId)

  const created = data as { blockId: string; assessmentId: string }
  return { ok: true, data: { blockId: created.blockId, assessmentId: created.assessmentId } }
}
