"use server"

import { createClient } from "@/lib/supabase/server"
import { createAdminClient } from "@/lib/supabase/admin"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import {
  isPathInsidePrefix,
  TASK_SUBMISSIONS_BUCKET,
  taskSubmissionPrefix,
} from "@/lib/storage/task-submission-file-path"
import { discardTaskUploadsSchema, type DiscardTaskUploadsInput } from "../schemas/task-submission-schemas"

/**
 * Cleans up objects from a submission that failed half-way (some files
 * uploaded, then an upload or `submit_task` failed). Only paths inside the
 * caller's own enrollment prefix that are NOT part of a recorded submission
 * are removed, so this can never delete a file the professor will grade.
 */
export async function discardTaskUploads(input: DiscardTaskUploadsInput): Promise<ActionResult<void>> {
  const parsed = discardTaskUploadsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const ctx = await requireOrgRole(["STUDENT"])
  const supabase = await createClient()
  const { assessmentId, enrollmentId, paths } = parsed.data

  // Both reads run under the student's own RLS: an enrollment that is not
  // theirs, or an assessment they cannot see, returns nothing.
  const [{ data: enrollment }, { data: assessment }] = await Promise.all([
    supabase.from("course_enrollments").select("id, course_id, offering_id, user_id").eq("id", enrollmentId).maybeSingle(),
    supabase.from("assessments").select("id, offering_id, organization_id").eq("id", assessmentId).maybeSingle(),
  ])

  if (
    !enrollment ||
    !assessment ||
    enrollment.user_id !== ctx.user.id ||
    enrollment.offering_id !== assessment.offering_id
  ) {
    return { ok: false, code: "FORBIDDEN", message: messages.errors.FORBIDDEN }
  }

  const prefix = taskSubmissionPrefix({
    organizationId: assessment.organization_id,
    courseId: enrollment.course_id,
    assessmentId,
    enrollmentId,
  })

  const candidates = paths.filter((path) => isPathInsidePrefix(path, prefix))
  if (candidates.length === 0) {
    return { ok: true, data: undefined }
  }

  const admin = createAdminClient()
  const { data: recorded } = await admin
    .from("assessment_submission_files")
    .select("storage_path")
    .in("storage_path", candidates)

  const keep = new Set((recorded ?? []).map((row) => row.storage_path))
  const orphans = candidates.filter((path) => !keep.has(path))

  if (orphans.length > 0) {
    await admin.storage.from(TASK_SUBMISSIONS_BUCKET).remove(orphans)
  }

  return { ok: true, data: undefined }
}
