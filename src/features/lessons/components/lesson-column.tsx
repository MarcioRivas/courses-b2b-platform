"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { ArrowDownIcon, ArrowUpIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { reorderLessons } from "../actions/reorder-lessons"
import { deleteLesson } from "../actions/delete-lesson"
import { LessonForm } from "./lesson-form"

export interface LessonColumnItem {
  id: string
  title: string
  description: string | null
}

interface LessonColumnProps {
  moduleId: string
  lessons: LessonColumnItem[]
  selectedLessonId: string | null
  onSelect: (lessonId: string) => void
  canEdit: boolean
}

export function LessonColumn({ moduleId, lessons, selectedLessonId, onSelect, canEdit }: LessonColumnProps) {
  const [isPending, startTransition] = useTransition()
  const labels = contentMessages.lessons

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
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{contentMessages.builder.lessonsTitle}</h2>
        {canEdit && (
          <LessonForm mode="create" moduleId={moduleId} trigger={<Button size="sm"><PlusIcon className="size-4" /> {labels.addAction}</Button>} />
        )}
      </div>

      {lessons.length === 0 ? (
        <EmptyState title={labels.emptyTitle} />
      ) : (
        <ul className="flex flex-col gap-2">
          {lessons.map((lesson, index) => (
            <li
              key={lesson.id}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-sm",
                selectedLessonId === lesson.id && "border-primary bg-muted/50"
              )}
            >
              <button type="button" onClick={() => onSelect(lesson.id)} className="text-left font-medium">
                {lesson.title}
              </button>

              {canEdit && (
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="icon-sm" disabled={index === 0 || isPending} onClick={() => move(index, -1)} title={labels.moveUp}>
                    <ArrowUpIcon className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={index === lessons.length - 1 || isPending} onClick={() => move(index, 1)} title={labels.moveDown}>
                    <ArrowDownIcon className="size-3.5" />
                  </Button>
                  <LessonForm
                    mode="edit"
                    moduleId={moduleId}
                    lesson={lesson}
                    trigger={<Button variant="ghost" size="icon-sm" title={messages.common.edit}><PencilIcon className="size-3.5" /></Button>}
                  />
                  <ConfirmDialog
                    trigger={<Button variant="ghost" size="icon-sm" title={messages.common.delete}><TrashIcon className="size-3.5" /></Button>}
                    title={labels.deleteTitle}
                    description={labels.deleteDescription}
                    confirmLabel={messages.common.delete}
                    destructive
                    successMessage={labels.deleted}
                    action={deleteLesson}
                    input={{ lessonId: lesson.id }}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
