"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { unassignProfessorSchema, type UnassignProfessorInput } from "../schemas/course-schemas"

export async function unassignProfessor(input: UnassignProfessorInput): Promise<ActionResult<void>> {
  const parsed = unassignProfessorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { error, data } = await supabase
    .from("course_professors")
    .delete()
    .eq("course_id", parsed.data.courseId)
    .eq("user_id", parsed.data.userId)
    .select("course_id")

  if (error) {
    return { ok: false, ...toActionError(error) }
  }
  if (!data || data.length === 0) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "course.professor_unassigned",
    entityType: "course",
    entityId: parsed.data.courseId,
    metadata: { userId: parsed.data.userId },
  })

  revalidatePath(`/admin/courses/${parsed.data.courseId}/professors`)

  return { ok: true, data: undefined }
}
