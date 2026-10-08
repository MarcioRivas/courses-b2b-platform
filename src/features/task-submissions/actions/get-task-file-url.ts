"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { TASK_SUBMISSIONS_BUCKET } from "@/lib/storage/task-submission-file-path"
import { taskFileUrlSchema, type TaskFileUrlInput } from "../schemas/task-submission-schemas"

/** Download links are minted per click and expire quickly; they are never stored. */
const SIGNED_URL_TTL_SECONDS = 60

/**
 * A short-lived URL for one submitted file. `task_file_for_download` runs as
 * the CALLER and only answers for the submission's owner or a grader
 * (`can_view_attempt`); only then does the service role sign the object.
 * `download` forces a download with the original name; otherwise the URL
 * opens inline (PDF and images).
 */
export async function getTaskFileUrl(
  input: TaskFileUrlInput & { download?: boolean }
): Promise<ActionResult<{ url: string }>> {
  const parsed = taskFileUrlSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("task_file_for_download", { p_file: parsed.data.fileId })

  const file = data?.[0]
  if (error || !file) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const { data: signed, error: signError } = await createAdminClient()
    .storage.from(TASK_SUBMISSIONS_BUCKET)
    .createSignedUrl(file.storage_path, SIGNED_URL_TTL_SECONDS, input.download ? { download: file.filename } : undefined)

  if (signError || !signed) {
    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  return { ok: true, data: { url: signed.signedUrl } }
}
