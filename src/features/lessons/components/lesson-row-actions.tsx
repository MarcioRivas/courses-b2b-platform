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
  variant?: "row" | "header"
  /** Navigate here after a successful delete (lesson page header, back to the module page). */
  redirectTo?: string
}

/** up/down · edit · delete — shared by lesson rows and the lesson page header. */
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
  const iconSize = isHeader ? "size-4" : "size-3.5"

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
      <LessonForm
        mode="edit"
        moduleId={moduleId}
        lesson={lesson}
        trigger={
          isHeader ? (
            <Button variant="outline" size="sm"><PencilIcon className={iconSize} /> {messages.common.edit}</Button>
          ) : (
            <Button variant="ghost" size="icon-sm" title={messages.common.edit} aria-label={messages.common.edit}><PencilIcon className={iconSize} /></Button>
          )
        }
      />
      <ConfirmDialog
        trigger={
          <Button variant="ghost" size={isHeader ? "sm" : "icon-sm"} className={isHeader ? "text-destructive hover:text-destructive" : undefined} title={messages.common.delete} aria-label={messages.common.delete}>
            <TrashIcon className={iconSize} />{isHeader && ` ${messages.common.delete}`}
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
    </div>
  )
}
