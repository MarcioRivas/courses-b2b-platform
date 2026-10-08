import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { editionCrumbs, editionPaths } from "@/lib/courses/edition-paths"
import { ModuleListPage } from "@/features/modules/components/module-list-page"
import { OfferingTabs } from "@/features/offerings/components/offering-tabs"

interface AdminEditionContentPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

/** ADMIN guard + `can_edit_offering` — level 1 of the edition's content drill-down (modules). */
export default async function AdminEditionContentPage({ params }: AdminEditionContentPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["ADMIN"])

  return (
    <ModuleListPage
      tree={tree}
      canEdit
      basePath={editionPaths("admin", tree).content}
      breadcrumb={editionCrumbs("admin", { ...tree, courseTitle: tree.title })}
      tabs={<OfferingTabs courseId={courseId} offeringId={offeringId} active="contenido" area="admin" />}
    />
  )
}
