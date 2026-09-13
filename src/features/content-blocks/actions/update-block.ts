"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { sanitizeHtml } from "@/lib/html/sanitize"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { updateContentBlockSchema, type UpdateContentBlockInput } from "../schemas/content-block-schemas"
import { sanitizeBlockData, resolveBlockAssessmentId } from "../lib/sanitize-block-data"
import { assertBlockAssessmentMatchesCourse } from "../lib/assert-block-assessment"

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

  const { data: courseId } = await supabase.rpc("course_id_of_lesson", { p_lesson: existing.lesson_id })
  if (!courseId || !(await canEditCourse(courseId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { block } = parsed.data
  const assessmentId = resolveBlockAssessmentId(block)
  if (assessmentId && (block.type === "QUIZ" || block.type === "TASK")) {
    if (!(await assertBlockAssessmentMatchesCourse(assessmentId, courseId, block.type))) {
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
    organizationId: await getCourseOrganizationId(courseId),
    action: "content_block.updated",
    entityType: "content_block",
    entityId: parsed.data.blockId,
    metadata: { type: block.type },
  })

  revalidatePath(`/admin/courses/${courseId}/content`)
  revalidatePath(`/teach/courses/${courseId}/content`)

  return { ok: true, data: undefined }
}
