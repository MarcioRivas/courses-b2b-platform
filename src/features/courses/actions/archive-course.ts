"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { courseIdSchema, type CourseIdInput } from "../schemas/course-schemas"

/** `archive_course` audits `course.archived` itself — this action must not double-log. */
export async function archiveCourse(input: CourseIdInput): Promise<ActionResult<void>> {
  const parsed = courseIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { error } = await supabase.rpc("archive_course", { p_course: parsed.data.courseId })

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  revalidatePath("/admin/courses")
  revalidatePath(`/admin/courses/${parsed.data.courseId}`)

  return { ok: true, data: undefined }
}
