import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { getCourseTree } from "@/features/courses/queries/get-course-tree"
import { ContentBuilder } from "@/features/modules/components/content-builder"

interface TeachCourseContentPageProps {
  params: Promise<{ courseId: string }>
}

/**
 * PROFESSOR guard + `canEditCourse` (requirement 1) — a professor only edits
 * courses they're assigned to; `notFound()` otherwise, same as the admin route.
 * Renders the exact same `ContentBuilder` (cross-agent contract: no fork).
 */
export default async function TeachCourseContentPage({ params }: TeachCourseContentPageProps) {
  await requireOrgRole(["PROFESSOR"])
  const { courseId } = await params

  if (!(await canEditCourse(courseId))) {
    return notFound()
  }

  const tree = await getCourseTree(courseId)
  if (!tree) {
    return notFound()
  }

  return (
    <ContentBuilder
      tree={tree}
      canEdit
      backHref="/teach/courses"
      assessmentsHref={`/teach/courses/${courseId}/assessments`}
    />
  )
}
