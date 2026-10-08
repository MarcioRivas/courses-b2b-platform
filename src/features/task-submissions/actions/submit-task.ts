"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { TASK_SUBMISSIONS_BUCKET } from "@/lib/storage/task-submission-file-path"
import { submitTaskSchema, type SubmitTaskInput } from "../schemas/task-submission-schemas"
import { taskRpcErrorResult } from "../lib/task-submission-errors"

/**
 * Step 2 of a submission, after the browser uploaded every file to its signed
 * URL. `submit_task` (as the student) re-runs the whole gate, checks each path
 * is inside this enrollment's prefix and really exists in the bucket, reads
 * size/MIME from the stored object, and swaps the file set atomically. The
 * objects it reports as replaced are then deleted — best effort: a failure
 * only leaves an orphan object, never a broken submission.
 */
export async function submitTask(input: SubmitTaskInput): Promise<ActionResult<{ attemptId: string }>> {
  const parsed = submitTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const supabase = await createClient()
  const { assessmentId, enrollmentId, files } = parsed.data

  const { data, error } = await supabase.rpc("submit_task", {
    p_assessment: assessmentId,
    p_enrollment: enrollmentId,
    p_files: files.map((file) => ({ path: file.path, filename: file.filename })),
  })

  const row = data?.[0]
  if (error || !row) {
    return taskRpcErrorResult(error)
  }

  if (row.removed_paths.length > 0) {
    const { error: removeError } = await createAdminClient().storage.from(TASK_SUBMISSIONS_BUCKET).remove(row.removed_paths)
    if (removeError) {
      console.error("submitTask: could not remove replaced files", removeError.message)
    }
  }

  revalidatePath(`/learn/assessments/${assessmentId}/start`)
  revalidatePath(`/learn/courses/${enrollmentId}`, "layout")

  return { ok: true, data: { attemptId: row.attempt_id } }
}
