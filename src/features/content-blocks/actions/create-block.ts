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
import { createContentBlockSchema, type CreateContentBlockInput } from "../schemas/content-block-schemas"
import { sanitizeBlockData, resolveBlockAssessmentId } from "../lib/sanitize-block-data"
import { assertBlockAssessmentMatchesCourse } from "../lib/assert-block-assessment"

export async function createBlock(input: CreateContentBlockInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createContentBlockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: courseId } = await supabase.rpc("course_id_of_lesson", { p_lesson: parsed.data.lessonId })
  if (!courseId) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditCourse(courseId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { block } = parsed.data
  const assessmentId = resolveBlockAssessmentId(block)
  if (assessmentId && (block.type === "QUIZ" || block.type === "TASK")) {
    if (!(await assertBlockAssessmentMatchesCourse(assessmentId, courseId, block.type))) {
      return { ok: false, code: "VALIDATION", message: teachAssessmentMessages.errors.assessmentKindMismatch }
    }
  }

  const { data: last } = await supabase
    .from("lesson_content_blocks")
    .select("position")
    .eq("lesson_id", parsed.data.lessonId)
    .order("position", { ascending: false })
    .limit(1)
    .maybeSingle()

  const data = sanitizeBlockData(block, sanitizeHtml)

  const { data: inserted, error } = await supabase
    .from("lesson_content_blocks")
    .insert({
      lesson_id: parsed.data.lessonId,
      type: block.type,
      data,
      assessment_id: assessmentId,
      is_required: parsed.data.isRequired,
      position: (last?.position ?? 0) + 1,
    })
    .select("id")
    .single()

  if (error || !inserted) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getCourseOrganizationId(courseId),
    action: "content_block.created",
    entityType: "content_block",
    entityId: inserted.id,
    metadata: { type: block.type, lessonId: parsed.data.lessonId },
  })

  revalidatePath(`/admin/courses/${courseId}/content`)
  revalidatePath(`/teach/courses/${courseId}/content`)

  return { ok: true, data: { id: inserted.id } }
}
