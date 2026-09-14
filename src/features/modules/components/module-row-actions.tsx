"use client"

import { ArrowDownIcon, ArrowUpIcon, LinkIcon, PencilIcon, TrashIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { deleteModule } from "../actions/delete-module"
import { ModuleForm } from "./module-form"
import { DependencyEditor, type ModuleDependencyItem } from "./dependency-editor"

export interface ModuleRowActionsProps {
  courseId: string
  module: { id: string; title: string; description: string | null; dependencies: ModuleDependencyItem[] }
  otherModules: { id: string; title: string }[]
  /** Reorder controls are omitted when `onMove` is absent (module header). */
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  isPending?: boolean
  /** Edit/dependencies as text buttons (header) instead of icon buttons (rows). */
  variant?: "row" | "header"
  /** Navigate here after a successful delete (module page header, back to the course page). */
  redirectTo?: string
}

/** up/down · edit · dependencies · delete — shared by module rows and the module page header. */
export function ModuleRowActions({
  courseId,
  module,
  otherModules,
  onMove,
  canMoveUp = false,
  canMoveDown = false,
  isPending = false,
  variant = "row",
  redirectTo,
}: ModuleRowActionsProps) {
  const labels = contentMessages.modules
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
      <ModuleForm
        mode="edit"
        courseId={courseId}
        module={module}
        trigger={
          isHeader ? (
            <Button variant="outline" size="sm"><PencilIcon className={iconSize} /> {messages.common.edit}</Button>
          ) : (
            <Button variant="ghost" size="icon-sm" title={messages.common.edit} aria-label={messages.common.edit}><PencilIcon className={iconSize} /></Button>
          )
        }
      />
      <DependencyEditor
        courseId={courseId}
        moduleId={module.id}
        dependencies={module.dependencies}
        otherModules={otherModules}
        trigger={
          isHeader ? (
            <Button variant="outline" size="sm"><LinkIcon className={iconSize} /> {labels.dependenciesAction}</Button>
          ) : (
            <Button variant="ghost" size="icon-sm" title={labels.dependenciesAction} aria-label={labels.dependenciesAction}><LinkIcon className={iconSize} /></Button>
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
        action={deleteModule}
        input={{ moduleId: module.id }}
        redirectTo={redirectTo}
      />
    </div>
  )
}
