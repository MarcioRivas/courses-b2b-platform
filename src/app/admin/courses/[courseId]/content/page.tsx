import { resolveEditableCourse } from "@/lib/courses/resolve-editable-course"
import { ModuleListPage } from "@/features/modules/components/module-list-page"

interface AdminCourseContentPageProps {
  params: Promise<{ courseId: string }>
}

/** ADMIN guard + `canEditCourse` — level 1 of the content drill-down (modules). */
export default async function AdminCourseContentPage({ params }: AdminCourseContentPageProps) {
  const { courseId } = await params
  const tree = await resolveEditableCourse(courseId, ["ADMIN"])

  return (
    <ModuleListPage
      tree={tree}
      canEdit
      basePath={`/admin/courses/${courseId}/content`}
      coursesHref="/admin/courses"
    />
  )
}
