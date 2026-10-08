import { LayersIcon, PlusIcon } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import type { BreadcrumbItem } from "@/components/shared/breadcrumb"
import { contentMessages } from "@/lib/messages/admin-content"
import type { OfferingTree } from "@/features/courses/queries/get-offering-tree"
import { CourseStatusBadge } from "@/features/courses/components/course-status-badge"
import { ContentPageHeader } from "./content-page-header"
import { ModuleForm } from "./module-form"
import { ModuleList } from "./module-list"

interface ModuleListPageProps {
  tree: OfferingTree
  /** The edition's `…/content` route — drives every link below. */
  basePath: string
  /** Crumbs up to (and including) the edition; the page appends nothing. */
  breadcrumb: BreadcrumbItem[]
  /** Edition tabs rendered under the header. */
  tabs?: ReactNode
  canEdit: boolean
}

/** Level 1 of the drill-down: course header + ordered module rows. */
export function ModuleListPage({ tree, basePath, breadcrumb, tabs, canEdit }: ModuleListPageProps) {
  const labels = contentMessages
  const createTrigger = (
    <Button size="sm">
      <PlusIcon className="size-4" /> {labels.modules.addAction}
    </Button>
  )
  const createForm = canEdit ? <ModuleForm mode="create" offeringId={tree.offeringId} openAfterCreateBase={basePath} trigger={createTrigger} /> : null
  // The create CTA lives in exactly one place: the empty state when there are no
  // modules, the header otherwise (a duplicate would also break `getByRole` in E2E).
  const isEmpty = tree.modules.length === 0

  return (
    <div className="flex flex-col gap-6">
      <ContentPageHeader
        breadcrumb={breadcrumb}
        eyebrow={labels.builder.courseEyebrow}
        title={tree.title}
        description={labels.builder.editionDescription(tree.offeringName)}
        icon={LayersIcon}
        badges={<CourseStatusBadge status={tree.status} />}
        actions={!isEmpty && createForm}
      />
      {tabs}

      {isEmpty ? (
        <EmptyState
          title={labels.modules.emptyTitle}
          description={labels.modules.emptyDescription}
          icon={LayersIcon}
          action={createForm}
        />
      ) : (
        <ModuleList
          offeringId={tree.offeringId}
          basePath={basePath}
          canEdit={canEdit}
          modules={tree.modules.map((m) => ({
            id: m.id,
            title: m.title,
            description: m.description,
            lessonCount: m.lessons.length,
            dependencies: m.dependencies,
          }))}
        />
      )}
    </div>
  )
}
