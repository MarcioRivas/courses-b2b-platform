import { safeFileName } from "./file-path"

/**
 * Student TASK submissions live in their own private bucket, under
 * `<organizationId>/<courseId>/<assessmentId>/<enrollmentId>/<uuid>-<name>`.
 * The bucket has no storage policies: uploads use server-minted signed upload
 * URLs and `submit_task` re-checks every path against this prefix.
 */
export const TASK_SUBMISSIONS_BUCKET = "task-submissions"

export const MAX_TASK_FILE_BYTES = 20_971_520 // 20 MB, matches the bucket limit

/** Extension → MIME for every type the bucket accepts (must match the migration). */
export const TASK_FILE_TYPES = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  doc: "application/msword",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xls: "application/vnd.ms-excel",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ppt: "application/vnd.ms-powerpoint",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
} as const

/** Value for `<input type="file" accept>`: extensions, since some OSes report no MIME for Office files. */
export const TASK_FILE_ACCEPT = Object.keys(TASK_FILE_TYPES)
  .map((extension) => `.${extension}`)
  .join(",")

/**
 * The MIME type to upload a file with, or null when it is not allowed. The
 * extension decides, never the browser-reported type (often "" for Office
 * files, and spoofable): `submit_task` requires the stored object's MIME to
 * match the filename's extension, so a mismatch would be refused anyway.
 */
export function resolveTaskFileMimeType(fileName: string): string | null {
  const extension = fileName.includes(".") ? (fileName.split(".").pop()?.toLowerCase() ?? "") : ""
  return (TASK_FILE_TYPES as Record<string, string>)[extension] ?? null
}

export function taskSubmissionPrefix(params: {
  organizationId: string
  courseId: string
  assessmentId: string
  enrollmentId: string
}): string {
  return `${params.organizationId}/${params.courseId}/${params.assessmentId}/${params.enrollmentId}/`
}

/** Builds a fresh object path inside the enrollment's own prefix. All ids come from the server. */
export function buildTaskSubmissionPath(params: {
  organizationId: string
  courseId: string
  assessmentId: string
  enrollmentId: string
  fileName: string
}): string {
  return `${taskSubmissionPrefix(params)}${crypto.randomUUID()}-${safeFileName(params.fileName)}`
}

/** True when `path` lies inside `prefix` and cannot climb out of it. */
export function isPathInsidePrefix(path: string, prefix: string): boolean {
  return path.startsWith(prefix) && !path.includes("..") && path.length > prefix.length
}
