"use client"

import { createClient } from "@/lib/supabase/client"
import {
  ALLOWED_COURSE_FILE_TYPES,
  buildCourseFilePath,
  COURSE_FILES_BUCKET,
  MAX_COURSE_FILE_BYTES,
} from "./file-path"

export interface UploadCourseFileResult {
  ok: boolean
  path?: string
  errorCode?: "TOO_LARGE" | "INVALID_TYPE" | "UPLOAD_FAILED"
}

/**
 * Browser → Storage upload with the session client. The bucket enforces the
 * 50MB limit and MIME allowlist server-side; these checks give the author
 * instant feedback without a round trip. The write policy re-checks
 * `can_edit_course(folder[2])` regardless (D10) — this helper cannot bypass it.
 *
 * `organizationId` must come from the course row, resolved server-side by the
 * page that renders the uploader — never from anything the browser can set.
 */
export async function uploadCourseFile(params: {
  organizationId: string
  courseId: string
  file: File
}): Promise<UploadCourseFileResult> {
  const { organizationId, courseId, file } = params

  if (file.size > MAX_COURSE_FILE_BYTES) {
    return { ok: false, errorCode: "TOO_LARGE" }
  }

  if (!ALLOWED_COURSE_FILE_TYPES.includes(file.type as (typeof ALLOWED_COURSE_FILE_TYPES)[number])) {
    return { ok: false, errorCode: "INVALID_TYPE" }
  }

  const path = buildCourseFilePath({ organizationId, courseId, fileName: file.name })
  const supabase = createClient()

  const { error } = await supabase.storage.from(COURSE_FILES_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  })

  if (error) {
    return { ok: false, errorCode: "UPLOAD_FAILED" }
  }

  return { ok: true, path }
}
