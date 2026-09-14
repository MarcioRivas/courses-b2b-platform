"use server"

import { revalidateCourseContent } from "@/lib/courses/revalidate-course-content"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getCourseOrganizationId } from "@/lib/courses/get-course-organization-id"
import { COURSE_FILES_BUCKET } from "@/lib/storage/file-path"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { deleteContentBlockSchema, type DeleteContentBlockInput } from "../schemas/content-block-schemas"

/** PDF/IMAGE blocks own a stored object; it's removed here too (requirement 9). */
export async function deleteBlock(input: DeleteContentBlockInput): Promise<ActionResult<void>> {
  const parsed = deleteContentBlockSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: block } = await supabase
    .from("lesson_content_blocks")
    .select("lesson_id, type, data")
    .eq("id", parsed.data.blockId)
    .maybeSingle()

  if (!block) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  const { data: courseId } = await supabase.rpc("course_id_of_lesson", { p_lesson: block.lesson_id })
  if (!courseId || !(await canEditCourse(courseId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  // Deleting the row cascades into `content_progress`, so it goes through the
  // guarded RPC like module and lesson deletion (C10). The RPC refuses with
  // CONTENT_IN_USE when a student has already completed the block, and returns
  // the stored object path so the file can be removed afterwards.
  const { data: storedPath, error } = await supabase.rpc("delete_content_block", {
    p_block: parsed.data.blockId,
  })

  if (error) {
    if (error.code === "23001") {
      return { ok: false, code: "CONFLICT", message: contentMessages.blocks.deleteInUse }
    }
    return { ok: false, ...toActionError(error) }
  }

  if (storedPath) {
    // Removed with the service-role client: `authenticated` has no SELECT on
    // storage.objects by design (D26), so a user-session remove cannot see the
    // object it is trying to delete. Authorisation already happened above.
    const admin = createAdminClient()
    const { error: storageError } = await admin.storage.from(COURSE_FILES_BUCKET).remove([storedPath])
    if (storageError) {
      // An orphaned object is accepted and documented (Risk Assessment) rather
      // than failing a deletion that already committed.
      console.error(`Failed to remove course file ${storedPath}: ${storageError.message}`)
    }
  }

  await logAudit({
    organizationId: await getCourseOrganizationId(courseId),
    action: "content_block.deleted",
    entityType: "content_block",
    entityId: parsed.data.blockId,
  })

  revalidateCourseContent(courseId)

  return { ok: true, data: undefined }
}
