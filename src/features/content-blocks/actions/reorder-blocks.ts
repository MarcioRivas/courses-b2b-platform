"use server"

import { revalidateCourseContent } from "@/lib/courses/revalidate-course-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { reorderContentBlocksSchema, type ReorderContentBlocksInput } from "../schemas/content-block-schemas"

/** The RPC writes the audit row itself (L10/M1) — do not re-add `logAudit` here. */
export async function reorderBlocks(input: ReorderContentBlocksInput): Promise<ActionResult<void>> {
  const parsed = reorderContentBlocksSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["ADMIN", "PROFESSOR"])
  const supabase = await createClient()

  const { data: courseId } = await supabase.rpc("course_id_of_lesson", { p_lesson: parsed.data.lessonId })

  const { error } = await supabase.rpc("reorder_content_blocks", {
    p_lesson: parsed.data.lessonId,
    p_ordered_ids: parsed.data.orderedIds,
  })

  if (error) {
    if (error.code === "22023") {
      return { ok: false, code: "VALIDATION", message: contentMessages.errors.orderedListMismatch }
    }
    return { ok: false, ...toActionError(error) }
  }

  if (courseId) {
    revalidateCourseContent(courseId)
  }

  return { ok: true, data: undefined }
}
