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
  offeringId: string
  module: { id: string; title: string; description: string | null; dependencies: ModuleDependencyItem[] }
  otherModules: { id: string; title: string }[]
  /** Reorder controls are omitted when `onMove` is absent (module header). */
  onMove?: (direction: -1 | 1) => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  isPending?: boolean
  /**
   * Rows show reorder + dependencies only: edit and delete live on the module's
   * own page (header), so people open the module before changing it.
   */
  variant?: "row" | "header"
  /** Navigate here after a successful delete (module page header, back to the course page). */
  redirectTo?: string
}

/** Rows: up/down · dependencies. Header: edit · dependencies · delete. */
export function ModuleRowActions({
  offeringId,
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
      {isHeader && (
        <ModuleForm
          mode="edit"
          offeringId={offeringId}
          module={module}
          trigger={<Button variant="outline" size="sm"><PencilIcon className={iconSize} /> {messages.common.edit}</Button>}
        />
      )}
      <DependencyEditor
        offeringId={offeringId}
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
      {isHeader && (
        <ConfirmDialog
          trigger={
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
              <TrashIcon className={iconSize} /> {messages.common.delete}
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
      )}
    </div>
  )
}
