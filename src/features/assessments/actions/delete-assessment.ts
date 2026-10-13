"use server"

import { revalidateOfferingExams } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { deleteAssessmentSchema, type DeleteAssessmentInput } from "../schemas/assessment-schemas"

/** Thin wrapper over `delete_assessment` (C10), used by EXAMs: refuses once students have attempts. */
export async function deleteAssessment(input: DeleteAssessmentInput): Promise<ActionResult<void>> {
  const parsed = deleteAssessmentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("assessments")
    .select("offering_id")
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  const { error } = await supabase.rpc("delete_assessment", { p_assessment: parsed.data.assessmentId })

  if (error) {
    if (error.message.includes("CONFLICT_HAS_ATTEMPTS")) {
      return { ok: false, code: "CONFLICT", message: teachAssessmentMessages.errors.CONFLICT_HAS_ATTEMPTS }
    }
    return { ok: false, ...toActionError(error) }
  }

  if (existing) {
    await revalidateOfferingExams(existing.offering_id)
  }

  return { ok: true, data: undefined }
}
