"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"
import {
  buildTaskSubmissionPath,
  resolveTaskFileMimeType,
  TASK_SUBMISSIONS_BUCKET,
} from "@/lib/storage/task-submission-file-path"
import { prepareTaskUploadSchema, type PrepareTaskUploadInput } from "../schemas/task-submission-schemas"
import { taskRpcErrorResult } from "../lib/task-submission-errors"

export interface PreparedTaskUpload {
  path: string
  token: string
  filename: string
  contentType: string
}

/**
 * Step 1 of a submission: `task_submission_slot` runs as the STUDENT (who may
 * submit now, how many files, late or not); only once it passes does the
 * service-role client mint one signed upload URL per file, each under the
 * enrollment's own prefix. The bucket has no storage policies, so these
 * tokens are the only way to write into it. Never sign first and check after.
 */
export async function prepareTaskUpload(
  input: PrepareTaskUploadInput
): Promise<ActionResult<{ uploads: PreparedTaskUpload[]; isLate: boolean }>> {
  const parsed = prepareTaskUploadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const supabase = await createClient()
  const { assessmentId, enrollmentId, files } = parsed.data

  const { data, error } = await supabase.rpc("task_submission_slot", {
    p_assessment: assessmentId,
    p_enrollment: enrollmentId,
  })

  const slot = data?.[0]
  if (error || !slot) {
    return taskRpcErrorResult(error)
  }

  if (files.length > slot.max_files) {
    return { ok: false, code: "VALIDATION", message: taskSubmissionMessages.validation.tooManyFiles(slot.max_files) }
  }

  const typed: { name: string; contentType: string }[] = []
  for (const file of files) {
    const contentType = resolveTaskFileMimeType(file.name)
    if (!contentType) {
      return { ok: false, code: "VALIDATION", message: taskSubmissionMessages.validation.fileTypeNotAllowed(file.name) }
    }
    typed.push({ name: file.name, contentType })
  }

  const admin = createAdminClient()
  const uploads: PreparedTaskUpload[] = []

  for (const file of typed) {
    const path = buildTaskSubmissionPath({
      organizationId: slot.organization_id,
      courseId: slot.course_id,
      assessmentId,
      enrollmentId,
      fileName: file.name,
    })

    const { data: signed, error: signError } = await admin.storage
      .from(TASK_SUBMISSIONS_BUCKET)
      .createSignedUploadUrl(path)

    if (signError || !signed) {
      return { ok: false, code: "INTERNAL", message: taskSubmissionMessages.errors.UPLOAD_FAILED }
    }

    uploads.push({ path, token: signed.token, filename: file.name, contentType: file.contentType })
  }

  return { ok: true, data: { uploads, isLate: slot.is_late } }
}
