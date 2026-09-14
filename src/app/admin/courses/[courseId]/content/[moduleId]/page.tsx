import { findModuleOr404, resolveEditableCourse } from "@/lib/courses/resolve-editable-course"
import { ModuleDetailPage } from "@/features/modules/components/module-detail-page"

interface AdminModulePageProps {
  params: Promise<{ courseId: string; moduleId: string }>
}

/** ADMIN guard + `canEditCourse` — level 2 of the content drill-down (lessons of a module). */
export default async function AdminModulePage({ params }: AdminModulePageProps) {
  const { courseId, moduleId } = await params
  const tree = await resolveEditableCourse(courseId, ["ADMIN"])
  const courseModule = findModuleOr404(tree, moduleId)

  return (
    <ModuleDetailPage
      tree={tree}
      module={courseModule}
      canEdit
      basePath={`/admin/courses/${courseId}/content`}
      coursesHref="/admin/courses"
    />
  )
}
