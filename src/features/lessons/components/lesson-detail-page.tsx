import { FileTextIcon } from "lucide-react"
import { contentMessages } from "@/lib/messages/admin-content"
import type { CourseTree, CourseTreeLesson, CourseTreeModule } from "@/features/courses/queries/get-course-tree"
import { BlockList } from "@/features/content-blocks/components/block-list"
import { OFFERABLE_BLOCK_TYPES } from "@/features/content-blocks/schemas/content-block-schemas"
import { ContentPageHeader } from "@/features/modules/components/content-page-header"
import { ContentSiblingNav } from "@/features/modules/components/content-sibling-nav"
import { LessonRowActions } from "./lesson-row-actions"

interface LessonDetailPageProps {
  tree: CourseTree
  module: CourseTreeModule
  lesson: CourseTreeLesson
  basePath: string
  coursesHref: string
  canEdit: boolean
}

/** Level 3 of the drill-down: lesson header + full-width block list + prev/next lesson. */
export function LessonDetailPage({ tree, module, lesson, basePath, coursesHref, canEdit }: LessonDetailPageProps) {
  const labels = contentMessages.builder
  const modulePath = `${basePath}/${module.id}`
  const index = module.lessons.findIndex((l) => l.id === lesson.id)
  const toSibling = (l: CourseTreeLesson | undefined) => (l ? { href: `${modulePath}/${l.id}`, title: l.title } : null)

  return (
    <div className="flex flex-col gap-6">
      <ContentPageHeader
        breadcrumb={[
          { label: labels.coursesCrumb, href: coursesHref },
          { label: tree.title, href: basePath },
          { label: module.title, href: modulePath },
          { label: lesson.title },
        ]}
        eyebrow={labels.lessonEyebrow(index + 1)}
        title={lesson.title}
        description={lesson.description}
        icon={FileTextIcon}
        actions={
          canEdit && (
            <LessonRowActions
              variant="header"
              moduleId={module.id}
              lesson={{ id: lesson.id, title: lesson.title, description: lesson.description }}
              redirectTo={modulePath}
            />
          )
        }
      />

      <BlockList
        organizationId={tree.organizationId}
        courseId={tree.courseId}
        lessonId={lesson.id}
        // Only block types this builder knows how to render; guards against a future DB enum value.
        blocks={lesson.blocks.filter((block) => (OFFERABLE_BLOCK_TYPES as readonly string[]).includes(block.type)) as never}
        canEdit={canEdit}
      />

      <ContentSiblingNav
        ariaLabel={labels.lessonsTitle}
        prev={toSibling(module.lessons[index - 1])}
        next={toSibling(module.lessons[index + 1])}
        prevLabel={labels.prevLesson}
        nextLabel={labels.nextLesson}
      />
    </div>
  )
}
