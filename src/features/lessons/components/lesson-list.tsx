"use client"

import { useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { contentMessages } from "@/lib/messages/admin-content"
import { reorderLessons } from "../actions/reorder-lessons"
import { LessonRowActions } from "./lesson-row-actions"

export interface LessonRowItem {
  id: string
  title: string
  description: string | null
  blockCount: number
}

interface LessonListProps {
  moduleId: string
  /** `${basePath}/${moduleId}` — lesson links append `/${lessonId}`. */
  modulePath: string
  lessons: LessonRowItem[]
  canEdit: boolean
}

/** Ordered lesson rows: number · title (link) · 1-line description · block counter · actions. */
export function LessonList({ moduleId, modulePath, lessons, canEdit }: LessonListProps) {
  const [isPending, startTransition] = useTransition()
  const labels = contentMessages.builder

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= lessons.length) return

    const orderedIds = lessons.map((l) => l.id)
    ;[orderedIds[index], orderedIds[target]] = [orderedIds[target] as string, orderedIds[index] as string]

    startTransition(async () => {
      const result = await reorderLessons({ moduleId, orderedIds })
      if (!result.ok) toast.error(result.message)
    })
  }

  return (
    <ol className="flex flex-col gap-2" aria-label={labels.lessonsTitle}>
      {lessons.map((lesson, index) => (
        <li
          key={lesson.id}
          className="flex flex-col gap-3 rounded-xl border bg-card p-3 shadow-card transition-colors hover:border-primary/40 sm:flex-row sm:items-start sm:gap-4 sm:p-4"
        >
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-sm font-semibold text-sky-800 tabular-nums"
            >
              {index + 1}
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <Link
                href={`${modulePath}/${lesson.id}`}
                className="line-clamp-2 w-fit max-w-full text-base font-semibold text-foreground hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {lesson.title}
              </Link>
              {lesson.description && (
                <p className="line-clamp-1 text-sm text-muted-foreground">{lesson.description}</p>
              )}
              <span className="text-xs font-medium text-muted-foreground tabular-nums">
                {labels.blockCount(lesson.blockCount)}
              </span>
            </div>
          </div>

          {canEdit && (
            <div className="shrink-0 pl-11 sm:pl-0">
              <LessonRowActions
                moduleId={moduleId}
                lesson={lesson}
                onMove={(direction) => move(index, direction)}
                canMoveUp={index > 0}
                canMoveDown={index < lessons.length - 1}
                isPending={isPending}
              />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
