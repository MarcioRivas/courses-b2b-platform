"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { assessmentErrorMessage } from "../errors"
import { deleteAssessmentSchema, type DeleteAssessmentInput } from "../schemas/assessment-schemas"

/** Thin wrapper over `delete_assessment` (C10): refuses when attempts or a content block still reference it. */
export async function deleteAssessment(input: DeleteAssessmentInput): Promise<ActionResult<void>> {
  const parsed = deleteAssessmentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("assessments")
    .select("course_id")
    .eq("id", parsed.data.assessmentId)
    .maybeSingle()

  const { error } = await supabase.rpc("delete_assessment", { p_assessment: parsed.data.assessmentId })

  if (error) {
    if (error.message.includes("CONFLICT_HAS_ATTEMPTS") || error.message.includes("CONFLICT_HAS_BLOCKS")) {
      return { ok: false, code: "CONFLICT", message: assessmentErrorMessage(error.message) }
    }
    return { ok: false, ...toActionError(error) }
  }

  if (existing) {
    revalidatePath(`/teach/courses/${existing.course_id}/assessments`)
  }

  return { ok: true, data: undefined }
}
