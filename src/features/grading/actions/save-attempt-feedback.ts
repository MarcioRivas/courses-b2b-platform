"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { saveAttemptFeedbackSchema, type SaveAttemptFeedbackInput } from "../schemas/grading-schemas"

/** Overall feedback on an attempt (B12), visible to the student once GRADED. */
export async function saveAttemptFeedback(input: SaveAttemptFeedbackInput): Promise<ActionResult<void>> {
  const parsed = saveAttemptFeedbackSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  await requireOrgRole(["PROFESSOR"])
  const supabase = await createClient()

  const { error } = await supabase.rpc("upsert_attempt_feedback", {
    p_attempt: parsed.data.attemptId,
    p_feedback: parsed.data.feedback,
  })

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  revalidatePath(`/teach/grading/${parsed.data.attemptId}`)

  return { ok: true, data: undefined }
}
