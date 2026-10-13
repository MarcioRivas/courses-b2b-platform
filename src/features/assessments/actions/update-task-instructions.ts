"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { updateTaskInstructionsSchema, type UpdateTaskInstructionsInput } from "../schemas/assessment-schemas"

/** Wizard step 2 for a TASK: the instruction text students read. */
export async function updateTaskInstructions(input: UpdateTaskInstructionsInput): Promise<ActionResult<void>> {
  const parsed = updateTaskInstructionsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("assessments")
    .select("id, offering_id, organization_id, kind, status")
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  if (!existing || existing.kind !== "TASK") {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditOffering(existing.offering_id))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  // A published task must keep telling students what to hand in.
  if (existing.status === "PUBLISHED" && !parsed.data.instructions) {
    return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.taskRequiresInstructions }
  }

  const { error } = await supabase
    .from("assessments")
    .update({ instructions: parsed.data.instructions || null })
    .eq("id", existing.id)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: existing.organization_id,
    action: "assessment.updated",
    entityType: "assessment",
    entityId: existing.id,
    metadata: { kind: "TASK", field: "instructions" },
  })

  await revalidateOfferingContent(existing.offering_id)

  return { ok: true, data: undefined }
}
