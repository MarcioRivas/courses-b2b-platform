"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { logAudit } from "@/lib/audit/log"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { assignProfessorSchema, type AssignProfessorInput } from "../schemas/course-schemas"

/**
 * Direct insert into `course_professors` (admin write policy). The BEFORE
 * INSERT trigger `assert_active_member_of_org` raises a bare P0001 for a
 * non-ACTIVE-PROFESSOR or cross-org target — matched here exactly like
 * `add-group-members.ts` does for the analogous group trigger.
 */
export async function assignProfessor(input: AssignProfessorInput): Promise<ActionResult<void>> {
  const parsed = assignProfessorSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { error } = await supabase.from("course_professors").insert({
    course_id: parsed.data.courseId,
    user_id: parsed.data.userId,
    assigned_by: ctx.user.id,
  })

  if (error) {
    if (error.code === "P0001" && error.message.includes("does not have an ACTIVE")) {
      return { ok: false, code: "CONFLICT", message: courseMessages.errors.invalidProfessor }
    }
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: ctx.organizationId,
    action: "course.professor_assigned",
    entityType: "course",
    entityId: parsed.data.courseId,
    metadata: { userId: parsed.data.userId },
  })

  revalidatePath(`/admin/courses/${parsed.data.courseId}/professors`)

  return { ok: true, data: undefined }
}
