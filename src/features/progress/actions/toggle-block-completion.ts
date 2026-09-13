"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { learnMessages } from "@/lib/messages/learn"
import {
  toggleBlockCompletionSchema,
  type ToggleBlockCompletionInput,
} from "../schemas/progress-schemas"

export interface ProgressSnapshot {
  progressPercent: number
  completedBlocks: number
  totalBlocks: number
}

/**
 * Marks (or unmarks) one content block for the caller's enrollment.
 *
 * Every rule lives in `complete_content_block`: ownership, ACTIVE membership,
 * the module being open, and QUIZ/TASK blocks being off-limits (D33). This
 * action adds no guard of its own beyond the role gate — deleting the client's
 * disabled state must still end in a server rejection, which the phase's
 * integration suite asserts.
 */
export async function toggleBlockCompletion(
  input: ToggleBlockCompletionInput
): Promise<ActionResult<ProgressSnapshot>> {
  const parsed = toggleBlockCompletionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("complete_content_block", {
    p_enrollment: parsed.data.enrollmentId,
    p_block: parsed.data.blockId,
    p_completed: parsed.data.completed,
  })

  if (error) {
    if (error.message.includes("MODULE_LOCKED")) {
      return { ok: false, code: "LOCKED", message: learnMessages.errors.moduleLocked }
    }
    if (error.message.includes("INVALID_BLOCK_TYPE")) {
      return { ok: false, code: "VALIDATION", message: learnMessages.errors.invalidBlockType }
    }
    if (error.message.includes("ENROLLMENT_CANCELLED")) {
      return { ok: false, code: "FORBIDDEN", message: learnMessages.errors.enrollmentCancelled }
    }
    return { ok: false, ...toActionError(error) }
  }

  const snapshot = data?.[0]
  if (!snapshot) {
    return { ok: false, code: "INTERNAL", message: learnMessages.errors.completionFailed }
  }

  revalidatePath(`/learn/courses/${parsed.data.enrollmentId}`)

  return {
    ok: true,
    data: {
      progressPercent: Number(snapshot.progress_percent),
      completedBlocks: snapshot.completed_blocks,
      totalBlocks: snapshot.total_blocks,
    },
  }
}
