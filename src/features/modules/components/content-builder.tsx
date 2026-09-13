"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { contentMessages } from "@/lib/messages/admin-content"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { CourseTree } from "@/features/courses/queries/get-course-tree"
import { BlockList } from "@/features/content-blocks/components/block-list"
import { OFFERABLE_BLOCK_TYPES } from "@/features/content-blocks/schemas/content-block-schemas"
import { ModuleColumn } from "./module-column"
import { LessonColumn } from "@/features/lessons/components/lesson-column"

interface ContentBuilderProps {
  tree: CourseTree
  canEdit: boolean
  backHref: string
  /** "Evaluaciones" header link (Phase 5) — optional so the admin route (no mirror surface) keeps working unchanged. */
  assessmentsHref?: string
}

/**
 * Three-pane builder shell (requirement 1): modules → lessons → blocks.
 * Mobile-first: each pane is a `<details>` accordion below `md`; the CSS grid
 * takes over from `md` up, where all three stay open side by side (no JS
 * media-query branching needed).
 */
export function ContentBuilder({ tree, canEdit, backHref, assessmentsHref }: ContentBuilderProps) {
  const [selectedModuleId, setSelectedModuleId] = useState<string | null>(tree.modules[0]?.id ?? null)
  const [selectedLessonId, setSelectedLessonId] = useState<string | null>(
    tree.modules[0]?.lessons[0]?.id ?? null
  )

  // Selection falls back to the first available item instead of relying purely
  // on state: `useState` only seeds on mount, so after a revalidate that adds
  // the very first module (or removes the selected one) the stored id is stale
  // and the next pane would render its empty prompt over real content.
  const selectedModule = tree.modules.find((m) => m.id === selectedModuleId) ?? tree.modules[0] ?? null
  const selectedLesson =
    selectedModule?.lessons.find((l) => l.id === selectedLessonId) ?? selectedModule?.lessons[0] ?? null

  function handleSelectModule(moduleId: string) {
    setSelectedModuleId(moduleId)
    const nextModule = tree.modules.find((m) => m.id === moduleId)
    setSelectedLessonId(nextModule?.lessons[0]?.id ?? null)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Link href={backHref} className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeftIcon className="size-4" /> {contentMessages.builder.backToCourse}
        </Link>
        {assessmentsHref && (
          <Link href={assessmentsHref} className="text-sm font-medium text-primary hover:underline">
            {teachAssessmentMessages.nav.assessments}
          </Link>
        )}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3 md:items-start">
        <details className="rounded-lg border p-4 md:border-none md:p-0" open>
          <summary className="cursor-pointer font-medium md:hidden">{contentMessages.builder.modulesTitle}</summary>
          <div className="mt-3 md:mt-0">
            <ModuleColumn
              courseId={tree.courseId}
              modules={tree.modules.map((m) => ({ id: m.id, title: m.title, description: m.description, dependencies: m.dependencies }))}
              selectedModuleId={selectedModuleId}
              onSelect={handleSelectModule}
              canEdit={canEdit}
            />
          </div>
        </details>

        <details className="rounded-lg border p-4 md:border-none md:p-0" open>
          <summary className="cursor-pointer font-medium md:hidden">{contentMessages.builder.lessonsTitle}</summary>
          <div className="mt-3 md:mt-0">
            {selectedModule ? (
              <LessonColumn
                moduleId={selectedModule.id}
                lessons={selectedModule.lessons.map((l) => ({ id: l.id, title: l.title, description: l.description }))}
                selectedLessonId={selectedLessonId}
                onSelect={setSelectedLessonId}
                canEdit={canEdit}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{contentMessages.builder.selectModulePrompt}</p>
            )}
          </div>
        </details>

        <details className="rounded-lg border p-4 md:border-none md:p-0" open>
          <summary className="cursor-pointer font-medium md:hidden">{contentMessages.builder.blocksTitle}</summary>
          <div className="mt-3 md:mt-0">
            {selectedLesson ? (
              <BlockList
                organizationId={tree.organizationId}
                courseId={tree.courseId}
                lessonId={selectedLesson.id}
                // Phase 5 enables QUIZ/TASK; the filter now only guards against any future
                // DB enum value this builder doesn't know how to render yet.
                blocks={selectedLesson.blocks.filter((block) =>
                  (OFFERABLE_BLOCK_TYPES as readonly string[]).includes(block.type)
                ) as never}
                canEdit={canEdit}
              />
            ) : (
              <p className="text-sm text-muted-foreground">{contentMessages.builder.selectLessonPrompt}</p>
            )}
          </div>
        </details>
      </div>
    </div>
  )
}
