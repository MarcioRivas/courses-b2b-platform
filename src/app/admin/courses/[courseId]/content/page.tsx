import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { getCourseTree } from "@/features/courses/queries/get-course-tree"
import { ContentBuilder } from "@/features/modules/components/content-builder"

interface AdminCourseContentPageProps {
  params: Promise<{ courseId: string }>
}

/** ADMIN guard + `canEditCourse` (requirement 1) — an admin can edit any course of their org. */
export default async function AdminCourseContentPage({ params }: AdminCourseContentPageProps) {
  await requireOrgRole(["ADMIN"])
  const { courseId } = await params

  if (!(await canEditCourse(courseId))) {
    return notFound()
  }

  const tree = await getCourseTree(courseId)
  if (!tree) {
    return notFound()
  }

  return <ContentBuilder tree={tree} canEdit backHref={`/admin/courses/${courseId}`} />
}
