/** Every course file lives under `<organizationId>/<courseId>/<uuid>-<name>`. */
export const COURSE_FILES_BUCKET = "course-files"

export const MAX_COURSE_FILE_BYTES = 52_428_800 // 50 MB, matches the bucket limit

export const ALLOWED_COURSE_FILE_TYPES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
] as const

/**
 * Strips anything that could change how the path is parsed. The storage write
 * policy reads the organization and course from the first two segments, so a
 * filename must never be able to introduce another one.
 */
export function safeFileName(name: string): string {
  const withoutPath = name.split(/[\\/]/).pop() ?? "file"

  const cleaned = withoutPath
    .normalize("NFKD")
    .replace(/[^\w.\-]+/g, "-")
    .replace(/-{2,}/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-100)

  return cleaned || "file"
}

/**
 * Builds the object path. The organization id comes from the course row
 * server-side, never from client input, so a caller cannot aim at another
 * tenant's prefix.
 */
export function buildCourseFilePath(params: {
  organizationId: string
  courseId: string
  fileName: string
}): string {
  return `${params.organizationId}/${params.courseId}/${crypto.randomUUID()}-${safeFileName(params.fileName)}`
}

/**
 * True when `path` lies inside the given course's own prefix.
 *
 * Storing a path is not the same as owning it: an editor can put any string in
 * a block's `data.path`, including one belonging to a course they were
 * unassigned from. Checking the prefix is what keeps "the block stores it" from
 * becoming "the server will sign it".
 */
export function isPathInsideCourse(path: string, organizationId: string, courseId: string): boolean {
  return path.startsWith(`${organizationId}/${courseId}/`) && !path.includes("..")
}
