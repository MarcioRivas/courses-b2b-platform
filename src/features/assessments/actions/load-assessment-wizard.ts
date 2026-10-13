"use server"

import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
import { getAssessmentEditorData, getAssessmentWizardContext } from "../queries/get-assessment-editor-data"
import type { AssessmentEditorData, AssessmentWizardContext } from "../types"

/**
 * Read-only Server Action for the content-block editor, a nested client
 * component with no RSC data path: org context for a new QUIZ/TASK, plus the
 * assessment itself when editing one.
 */
export async function loadAssessmentWizard(
  offeringId: string,
  assessmentId?: string
): Promise<{ context: AssessmentWizardContext; assessment: AssessmentEditorData | null } | null> {
  await requireOrgRole(["ADMIN", "PROFESSOR"])
  if (!(await canEditOffering(offeringId))) {
    return null
  }

  const [context, assessment] = await Promise.all([
    getAssessmentWizardContext(await getOfferingOrganizationId(offeringId)),
    assessmentId ? getAssessmentEditorData(assessmentId) : Promise.resolve(null),
  ])

  if (assessmentId && (!assessment || assessment.offeringId !== offeringId)) {
    return null
  }

  return { context, assessment }
}
