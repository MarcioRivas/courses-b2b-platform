import { findModuleOr404, resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { editionCrumbs, editionPaths } from "@/lib/courses/edition-paths"
import { ModuleDetailPage } from "@/features/modules/components/module-detail-page"

interface TeachModulePageProps {
  params: Promise<{ courseId: string; offeringId: string; moduleId: string }>
}

/** PROFESSOR guard + `can_edit_offering` — level 2 of the content drill-down (lessons of a module). */
export default async function TeachModulePage({ params }: TeachModulePageProps) {
  const { courseId, offeringId, moduleId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])
  const courseModule = findModuleOr404(tree, moduleId)

  return (
    <ModuleDetailPage
      tree={tree}
      module={courseModule}
      canEdit
      basePath={editionPaths("teach", tree).content}
      breadcrumb={editionCrumbs("teach", { ...tree, courseTitle: tree.title })}
    />
  )
}
