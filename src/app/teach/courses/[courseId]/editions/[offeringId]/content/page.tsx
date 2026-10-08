import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { editionCrumbs, editionPaths } from "@/lib/courses/edition-paths"
import { ModuleListPage } from "@/features/modules/components/module-list-page"
import { OfferingTabs } from "@/features/offerings/components/offering-tabs"

interface TeachEditionContentPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

/** PROFESSOR guard + `can_edit_offering` — level 1 of the edition's content drill-down (modules). */
export default async function TeachEditionContentPage({ params }: TeachEditionContentPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])

  return (
    <ModuleListPage
      tree={tree}
      canEdit
      basePath={editionPaths("teach", tree).content}
      breadcrumb={editionCrumbs("teach", { ...tree, courseTitle: tree.title })}
      tabs={<OfferingTabs courseId={courseId} offeringId={offeringId} active="contenido" area="teach" />}
    />
  )
}
