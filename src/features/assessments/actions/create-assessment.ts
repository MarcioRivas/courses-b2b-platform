"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { createAssessmentSchema, assessmentKindDefaults, type CreateAssessmentInput } from "../schemas/assessment-schemas"

/**
 * Creates the assessment shell (title + kind) with kind defaults (B3, D12).
 * Full configuration (questions, window, passing score) happens on the
 * detail page via `updateAssessment` / `setAssessmentQuestions` — mirrors
 * the module/lesson "create, then configure" idiom used elsewhere.
 */
export async function createAssessment(input: CreateAssessmentInput): Promise<ActionResult<{ id: string }>> {
  const parsed = createAssessmentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN", "PROFESSOR"])
  if (!(await canEditCourse(parsed.data.courseId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const supabase = await createClient()
  const settings = await getOrgSettings(ctx.organizationId)
  const defaults = assessmentKindDefaults(parsed.data.kind)

  const { data, error } = await supabase
    .from("assessments")
    .insert({
      organization_id: ctx.organizationId,
      course_id: parsed.data.courseId,
      kind: parsed.data.kind,
      title: parsed.data.title,
      passing_score: settings?.defaultPassingScore ?? 60,
      max_attempts: defaults.maxAttempts,
      created_by: ctx.user.id,
    })
    .select("id")
    .single()

  if (error || !data) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "assessment.created",
    entityType: "assessment",
    entityId: data.id,
    metadata: { courseId: parsed.data.courseId, kind: parsed.data.kind },
  })

  revalidatePath(`/teach/courses/${parsed.data.courseId}/assessments`)

  return { ok: true, data: { id: data.id } }
}
