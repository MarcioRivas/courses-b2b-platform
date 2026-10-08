import { findModuleOr404, resolveEditableFirstEdition } from "@/lib/courses/resolve-editable-offering"
import { ModuleDetailPage } from "@/features/modules/components/module-detail-page"

interface TeachModulePageProps {
  params: Promise<{ courseId: string; moduleId: string }>
}

/** PROFESSOR guard + `canEditCourse` — level 2 of the content drill-down (lessons of a module). */
export default async function TeachModulePage({ params }: TeachModulePageProps) {
  const { courseId, moduleId } = await params
  const tree = await resolveEditableFirstEdition(courseId, ["PROFESSOR"])
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
