import type { BreadcrumbItem } from "@/components/shared/breadcrumb"
import { courseMessages } from "@/lib/messages/admin-courses"
import { offeringMessages } from "@/lib/messages/admin-offerings"

export type EditionArea = "admin" | "teach"

interface EditionRef {
  courseId: string
  offeringId: string
}

/** Route prefixes of one edition: `/admin/courses/c/offerings/o` or `/teach/courses/c/editions/o`. */
export function editionPaths(area: EditionArea, { courseId, offeringId }: EditionRef) {
  const base =
    area === "admin"
      ? `/admin/courses/${courseId}/offerings/${offeringId}`
      : `/teach/courses/${courseId}/editions/${offeringId}`
  return { base, content: `${base}/content`, exams: `${base}/exams` }
}

/**
 * Leading crumbs shared by the content builder and the exams screens:
 * Cursos › {curso} › [Ediciones ›] {edición}. The edition crumb links to the
 * edition's content (the teach area has no edition detail page).
 */
export function editionCrumbs(
  area: EditionArea,
  ref: EditionRef & { courseTitle: string; offeringName: string }
): BreadcrumbItem[] {
  const { content } = editionPaths(area, ref)
  const edition = { label: ref.offeringName, href: content }
  return area === "admin"
    ? [
        { label: courseMessages.list.title, href: "/admin/courses" },
        { label: ref.courseTitle, href: `/admin/courses/${ref.courseId}` },
        { label: offeringMessages.list.title, href: `/admin/courses/${ref.courseId}/offerings` },
        edition,
      ]
    : [{ label: courseMessages.list.title, href: "/teach/courses" }, { label: ref.courseTitle }, edition]
}
