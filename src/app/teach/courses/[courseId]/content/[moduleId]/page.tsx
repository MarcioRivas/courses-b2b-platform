import { findModuleOr404, resolveEditableCourse } from "@/lib/courses/resolve-editable-course"
import { ModuleDetailPage } from "@/features/modules/components/module-detail-page"

interface TeachModulePageProps {
  params: Promise<{ courseId: string; moduleId: string }>
}

/** PROFESSOR guard + `canEditCourse` — level 2 of the content drill-down (lessons of a module). */
export default async function TeachModulePage({ params }: TeachModulePageProps) {
  const { courseId, moduleId } = await params
  const tree = await resolveEditableCourse(courseId, ["PROFESSOR"])
  const courseModule = findModuleOr404(tree, moduleId)

  return (
    <ModuleDetailPage
      tree={tree}
      module={courseModule}
      canEdit
      basePath={`/teach/courses/${courseId}/content`}
      coursesHref="/teach/courses"
    />
  )
}
