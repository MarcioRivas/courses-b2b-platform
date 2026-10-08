"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { updateLessonSchema, type UpdateLessonInput } from "../schemas/lesson-schemas"

export async function updateLesson(input: UpdateLessonInput): Promise<ActionResult<void>> {
  const parsed = updateLessonSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: offeringId } = await supabase.rpc("offering_id_of_lesson", { p_lesson: parsed.data.lessonId })
  if (!offeringId) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }
  if (!(await canEditOffering(offeringId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { error } = await supabase
    .from("lessons")
    .update({ title: parsed.data.title, description: parsed.data.description || null })
    .eq("id", parsed.data.lessonId)

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getOfferingOrganizationId(offeringId),
    action: "lesson.updated",
    entityType: "lesson",
    entityId: parsed.data.lessonId,
    metadata: { title: parsed.data.title },
  })

  await revalidateOfferingContent(offeringId)

  return { ok: true, data: undefined }
}
