"use client"

import { ArrowDownIcon, ArrowUpIcon, PencilIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { deleteLesson } from "../actions/delete-lesson"
import { LessonForm } from "./lesson-form"

export interface LessonRowActionsProps {
  moduleId: string
  lesson: { id: string; title: string; description: string | null }
  /** Reorder controls are omitted when `onMove` is absent (lesson header). */
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  isPending?: boolean
  /** Rows show reorder only: edit and delete live on the lesson's own page (header). */
  variant?: "row" | "header"
  /** Navigate here after a successful delete (lesson page header, back to the module page). */
  redirectTo?: string
}

/** Rows: up/down. Header: edit · delete. */
export function LessonRowActions({
  moduleId,
  lesson,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
  isPending = false,
  variant = "row",
  redirectTo,
}: LessonRowActionsProps) {
  const labels = contentMessages.lessons
  const isHeader = variant === "header"

  return (
    <div className="flex flex-wrap items-center gap-1">
      {onMove && (
        <>
          <Button variant="ghost" size="icon-sm" disabled={!canMoveUp || isPending} onClick={() => onMove(-1)} title={labels.moveUp} aria-label={labels.moveUp}>
            <ArrowUpIcon className="size-3.5" />
          </Button>
          <Button variant="ghost" size="icon-sm" disabled={!canMoveDown || isPending} onClick={() => onMove(1)} title={labels.moveDown} aria-label={labels.moveDown}>
            <ArrowDownIcon className="size-3.5" />
          </Button>
        </>
      )}
      {isHeader && (
        <LessonForm
          mode="edit"
          moduleId={moduleId}
          lesson={lesson}
          trigger={<Button variant="outline" size="sm"><PencilIcon className="size-4" /> {messages.common.edit}</Button>}
        />
      )}
      {isHeader && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <TrashIcon className="size-4" /> {messages.common.delete}
            </Button>
          }
          title={labels.deleteTitle}
          description={labels.deleteDescription}
          confirmLabel={messages.common.delete}
          destructive
          successMessage={labels.deleted}
          action={deleteLesson}
          input={{ lessonId: lesson.id }}
          redirectTo={redirectTo}
        />
      )}
    </div>
  )
}
