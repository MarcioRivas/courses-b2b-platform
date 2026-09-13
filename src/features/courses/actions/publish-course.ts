"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { getCourseCompleteness } from "../queries/get-course"
import { courseIdSchema, type CourseIdInput } from "../schemas/course-schemas"

export interface PublishCourseResult {
  published: boolean
  missing?: string[]
}

/**
 * `publish_course` audits `course.published` and auto-creates the FREE
 * course's OPEN offering itself (D13) — this action must not double-log or
 * create anything. `COURSE_INCOMPLETE` is not a client error: it's a valid
 * outcome the dialog renders as a checklist, so it comes back as `ok: true`
 * with `published: false` rather than an `ActionResult` error.
 */
export async function publishCourse(input: CourseIdInput): Promise<ActionResult<PublishCourseResult>> {
  const parsed = courseIdSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { error } = await supabase.rpc("publish_course", { p_course: parsed.data.courseId })

  if (error) {
    if (error.message.includes("COURSE_INCOMPLETE")) {
      const completeness = await getCourseCompleteness(parsed.data.courseId)
      const missing: string[] = []
      if (!completeness.hasModule) missing.push(courseMessages.publish.missingModule)
      if (!completeness.hasLesson) missing.push(courseMessages.publish.missingLesson)
      if (!completeness.hasBlock) missing.push(courseMessages.publish.missingBlock)
      return { ok: true, data: { published: false, missing } }
    }
    return { ok: false, ...toActionError(error) }
  }

  revalidatePath("/admin/courses")
  revalidatePath(`/admin/courses/${parsed.data.courseId}`)
  revalidatePath(`/admin/courses/${parsed.data.courseId}/offerings`)

  return { ok: true, data: { published: true } }
}
