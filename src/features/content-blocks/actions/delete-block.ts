"use server"

import { revalidateOfferingContent } from "@/lib/courses/revalidate-offering-content"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import { logAudit } from "@/lib/audit/log"
import { getOfferingOrganizationId } from "@/lib/courses/get-offering-context"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { deleteContentBlockSchema, type DeleteContentBlockInput } from "../schemas/content-block-schemas"

/**
 * Deleting a block never deletes its stored object: edition copies share files
 * (B2), so removal is left to a future storage GC (backlog).
 */
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

  const { data: offeringId } = await supabase.rpc("offering_id_of_lesson", { p_lesson: block.lesson_id })
  if (!offeringId || !(await canEditOffering(offeringId))) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  // Deleting the row cascades into `content_progress`, so it goes through the
  // guarded RPC like module and lesson deletion (C10). The RPC refuses with
  // CONTENT_IN_USE when a student has already completed the block, and — for a
  // QUIZ/TASK block, which takes its assessment with it — CONFLICT_HAS_ATTEMPTS
  // once students have attempts or submissions.
  const { error } = await supabase.rpc("delete_content_block", {
    p_block: parsed.data.blockId,
  })

  if (error) {
    if (error.message.includes("CONFLICT_HAS_DEPENDENCIES")) {
      return { ok: false, code: "CONFLICT", message: contentMessages.errors.quizGatesModule }
    }
    if (error.message.includes("CONFLICT_HAS_ATTEMPTS")) {
      return { ok: false, code: "CONFLICT", message: teachAssessmentMessages.errors.deleteHasAttempts }
    }
    if (error.code === "23001") {
      return { ok: false, code: "CONFLICT", message: contentMessages.blocks.deleteInUse }
    }
    return { ok: false, ...toActionError(error) }
  }

  await logAudit({
    organizationId: await getOfferingOrganizationId(offeringId),
    action: "content_block.deleted",
    entityType: "content_block",
    entityId: parsed.data.blockId,
  })

  await revalidateOfferingContent(offeringId)

  return { ok: true, data: undefined }
}
