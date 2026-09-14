import { BookOpenIcon, PlusIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { contentMessages } from "@/lib/messages/admin-content"
import type { CourseTree, CourseTreeModule } from "@/features/courses/queries/get-course-tree"
import { LessonForm } from "@/features/lessons/components/lesson-form"
import { LessonList } from "@/features/lessons/components/lesson-list"
import { ContentPageHeader } from "./content-page-header"
import { ContentSiblingNav } from "./content-sibling-nav"
import { DependencyChips } from "./dependency-chips"
import { ModuleRowActions } from "./module-row-actions"

interface ModuleDetailPageProps {
  tree: CourseTree
  module: CourseTreeModule
  basePath: string
  coursesHref: string
  canEdit: boolean
}

/** Level 2 of the drill-down: module header + ordered lesson rows + prev/next module. */
export function ModuleDetailPage({ tree, module, basePath, coursesHref, canEdit }: ModuleDetailPageProps) {
  const labels = contentMessages
  const index = tree.modules.findIndex((m) => m.id === module.id)
  const modulePath = `${basePath}/${module.id}`
  const isEmpty = module.lessons.length === 0
  const toSibling = (m: CourseTreeModule | undefined) => (m ? { href: `${basePath}/${m.id}`, title: m.title } : null)

  const createForm = canEdit ? (
    <LessonForm
      mode="create"
      moduleId={module.id}
      openAfterCreateBase={modulePath}
      trigger={
        <Button size="sm">
          <PlusIcon className="size-4" /> {labels.lessons.addAction}
        </Button>
      }
    />
  ) : null

  return (
    <div className="flex flex-col gap-6">
      <ContentPageHeader
        breadcrumb={[
          { label: labels.builder.coursesCrumb, href: coursesHref },
          { label: tree.title, href: basePath },
          { label: module.title },
        ]}
        eyebrow={labels.builder.moduleEyebrow(index + 1)}
        title={module.title}
        description={module.description}
        icon={BookOpenIcon}
        actions={
          canEdit && (
            <>
              <ModuleRowActions
                variant="header"
                courseId={tree.courseId}
                module={{
                  id: module.id,
                  title: module.title,
                  description: module.description,
                  dependencies: module.dependencies,
                }}
                otherModules={tree.modules.filter((m) => m.id !== module.id).map((m) => ({ id: m.id, title: m.title }))}
                redirectTo={basePath}
              />
              {!isEmpty && createForm}
            </>
          )
        }
      />

      <DependencyChips
        dependencies={module.dependencies}
        moduleTitles={Object.fromEntries(tree.modules.map((m) => [m.id, m.title]))}
      />

      {isEmpty ? (
        <EmptyState
          title={labels.lessons.emptyTitle}
          description={labels.lessons.emptyDescription}
          icon={BookOpenIcon}
          action={createForm}
        />
      ) : (
        <LessonList
          moduleId={module.id}
          modulePath={modulePath}
          canEdit={canEdit}
          lessons={module.lessons.map((l) => ({
            id: l.id,
            title: l.title,
            description: l.description,
            blockCount: l.blocks.length,
          }))}
        />
      )}

      <ContentSiblingNav
        ariaLabel={labels.builder.modulesTitle}
        prev={toSibling(tree.modules[index - 1])}
        next={toSibling(tree.modules[index + 1])}
        prevLabel={labels.builder.prevModule}
        nextLabel={labels.builder.nextModule}
      />
    </div>
  )
}
