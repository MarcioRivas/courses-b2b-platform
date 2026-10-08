"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
import { sanitizeHtml } from "@/lib/html/sanitize"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { updateContentBlockSchema, type UpdateContentBlockInput } from "../schemas/content-block-schemas"
import { sanitizeBlockData, resolveBlockAssessmentId } from "../lib/sanitize-block-data"
import { assertBlockAssessmentMatchesOffering } from "../lib/assert-block-assessment"

/** Re-validates `data` server-side unconditionally — the client payload is never trusted (requirement 6). */
export async function updateBlock(input: UpdateContentBlockInput): Promise<ActionResult<void>> {
  const parsed = updateContentBlockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("lesson_content_blocks")
    .select("lesson_id")
    .eq("id", parsed.data.blockId)
    .maybeSingle()

  if (!existing) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { data: offeringId } = await supabase.rpc("offering_id_of_lesson", { p_lesson: existing.lesson_id })
  if (!offeringId || !(await canEditOffering(offeringId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { block } = parsed.data
  const assessmentId = resolveBlockAssessmentId(block)
  if (assessmentId && (block.type === "QUIZ" || block.type === "TASK")) {
    if (!(await assertBlockAssessmentMatchesOffering(assessmentId, offeringId, block.type))) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.assessmentKindMismatch }
    }
  }

  const data = sanitizeBlockData(block, sanitizeHtml)

  const { error } = await supabase
    .from("lesson_content_blocks")
    .update({ type: block.type, data, assessment_id: assessmentId, is_required: parsed.data.isRequired })
    .eq("id", parsed.data.blockId)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getOfferingOrganizationId(offeringId),
    action: "content_block.updated",
    entityType: "content_block",
    entityId: parsed.data.blockId,
    metadata: { type: block.type },
  })

  await revalidateOfferingContent(offeringId)

  return { ok: true, data: undefined }
}
