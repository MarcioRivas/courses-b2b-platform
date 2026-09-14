import Link from "next/link"
import { LayersIcon, PlusIcon } from "lucide-react"
import { Button, buttonVariants } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { contentMessages } from "@/lib/messages/admin-content"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { CourseTree } from "@/features/courses/queries/get-course-tree"
import { CourseStatusBadge } from "@/features/courses/components/course-status-badge"
import { ContentPageHeader } from "./content-page-header"
import { ModuleForm } from "./module-form"
import { ModuleList } from "./module-list"

interface ModuleListPageProps {
  tree: CourseTree
  /** `/admin/courses/{id}/content` or `/teach/courses/{id}/content` — drives every link below. */
  basePath: string
  /** "Cursos" crumb target (`/admin/courses` or `/teach/courses`). */
  coursesHref: string
  /** Professor-only "Evaluaciones" link; the admin route has no mirror surface. */
  assessmentsHref?: string
  canEdit: boolean
}

/** Level 1 of the drill-down: course header + ordered module rows. */
export function ModuleListPage({ tree, basePath, coursesHref, assessmentsHref, canEdit }: ModuleListPageProps) {
  const labels = contentMessages
  const createTrigger = (
    <Button size="sm">
      <PlusIcon className="size-4" /> {labels.modules.addAction}
    </Button>
  )
  const createForm = canEdit ? <ModuleForm mode="create" courseId={tree.courseId} openAfterCreateBase={basePath} trigger={createTrigger} /> : null
  // The create CTA lives in exactly one place: the empty state when there are no
  // modules, the header otherwise (a duplicate would also break `getByRole` in E2E).
  const isEmpty = tree.modules.length === 0

  return (
    <div className="flex flex-col gap-6">
      <ContentPageHeader
        breadcrumb={[{ label: labels.builder.coursesCrumb, href: coursesHref }, { label: tree.title }]}
        eyebrow={labels.builder.courseEyebrow}
        title={tree.title}
        icon={LayersIcon}
        badges={<CourseStatusBadge status={tree.status} />}
        actions={
          <>
            {assessmentsHref && (
              <Link href={assessmentsHref} className={buttonVariants({ variant: "outline", size: "sm" })}>
                {teachAssessmentMessages.nav.assessments}
              </Link>
            )}
            {!isEmpty && createForm}
          </>
        }
      />

      {isEmpty ? (
        <EmptyState
          title={labels.modules.emptyTitle}
          description={labels.modules.emptyDescription}
          icon={LayersIcon}
          action={createForm}
        />
      ) : (
        <ModuleList
          courseId={tree.courseId}
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
