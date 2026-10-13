"use server"

import { revalidateOfferingExams } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createExamSchema, type CreateExamInput } from "../schemas/assessment-schemas"
import { configToColumns } from "../lib/assessment-config-values"
import { getAssessmentWizardContext } from "../queries/get-assessment-editor-data"

/** Wizard step 1 for an EXAM (edition-level, no content block). Questions come next. */
export async function createExam(input: CreateExamInput): Promise<ActionResult<{ assessmentId: string }>> {
  const parsed = createExamSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }
  const { offeringId, config } = parsed.data
  if (config.kind !== "EXAM") {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN", "PROFESSOR"])
  if (!(await canEditOffering(offeringId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const supabase = await createClient()
  const organizationId = await getOfferingOrganizationId(offeringId)
  const { timeZone } = await getAssessmentWizardContext(organizationId)

  const { data, error } = await supabase
    .from("assessments")
    .insert({
      ...configToColumns(config, timeZone),
      organization_id: organizationId,
      offering_id: offeringId,
      kind: "EXAM",
      created_by: ctx.user.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId,
    action: "assessment.created",
    entityType: "assessment",
    entityId: data.id,
    metadata: { offeringId, kind: "EXAM" },
  })

  await revalidateOfferingExams(offeringId)

  return { ok: true, data: { assessmentId: data.id } }
}
