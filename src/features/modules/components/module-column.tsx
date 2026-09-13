"use client"

import { useTransition } from "react"
import { toast } from "sonner"
import { ArrowDownIcon, ArrowUpIcon, LinkIcon, PencilIcon, PlusIcon, TrashIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { messages } from "@/lib/messages/es"
import { contentMessages } from "@/lib/messages/admin-content"
import { reorderModules } from "../actions/reorder-modules"
import { deleteModule } from "../actions/delete-module"
import { ModuleForm } from "./module-form"
import { DependencyEditor, type ModuleDependencyItem } from "./dependency-editor"

export interface ModuleColumnItem {
  id: string
  title: string
  description: string | null
  dependencies: ModuleDependencyItem[]
}

interface ModuleColumnProps {
  courseId: string
  modules: ModuleColumnItem[]
  selectedModuleId: string | null
  onSelect: (moduleId: string) => void
  canEdit: boolean
}

export function ModuleColumn({ courseId, modules, selectedModuleId, onSelect, canEdit }: ModuleColumnProps) {
  const [isPending, startTransition] = useTransition()
  const labels = contentMessages.modules

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= modules.length) return

    const orderedIds = modules.map((m) => m.id)
    ;[orderedIds[index], orderedIds[target]] = [orderedIds[target] as string, orderedIds[index] as string]

    startTransition(async () => {
      const result = await reorderModules({ courseId, orderedIds })
      if (!result.ok) toast.error(result.message)
    })
  }

  const otherModulesFor = (moduleId: string) => modules.filter((m) => m.id !== moduleId).map((m) => ({ id: m.id, title: m.title }))

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium">{contentMessages.builder.modulesTitle}</h2>
        {canEdit && (
          <ModuleForm mode="create" courseId={courseId} trigger={<Button size="sm"><PlusIcon className="size-4" /> {labels.addAction}</Button>} />
        )}
      </div>

      {modules.length === 0 ? (
        <EmptyState title={labels.emptyTitle} />
      ) : (
        <ul className="flex flex-col gap-2">
          {modules.map((module, index) => (
            <li
              key={module.id}
              className={cn(
                "flex flex-col gap-2 rounded-lg border p-3 text-sm",
                selectedModuleId === module.id && "border-primary bg-muted/50"
              )}
            >
              <button type="button" onClick={() => onSelect(module.id)} className="text-left font-medium">
                {module.title}
              </button>

              {canEdit && (
                <div className="flex flex-wrap items-center gap-1">
                  <Button variant="ghost" size="icon-sm" disabled={index === 0 || isPending} onClick={() => move(index, -1)} title={labels.moveUp}>
                    <ArrowUpIcon className="size-3.5" />
                  </Button>
                  <Button variant="ghost" size="icon-sm" disabled={index === modules.length - 1 || isPending} onClick={() => move(index, 1)} title={labels.moveDown}>
                    <ArrowDownIcon className="size-3.5" />
                  </Button>
                  <ModuleForm
                    mode="edit"
                    courseId={courseId}
                    module={module}
                    trigger={<Button variant="ghost" size="icon-sm" title={messages.common.edit}><PencilIcon className="size-3.5" /></Button>}
                  />
                  <DependencyEditor
                    courseId={courseId}
                    moduleId={module.id}
                    dependencies={module.dependencies}
                    otherModules={otherModulesFor(module.id)}
                    trigger={<Button variant="ghost" size="icon-sm" title={labels.dependenciesAction}><LinkIcon className="size-3.5" /></Button>}
                  />
                  <ConfirmDialog
                    trigger={<Button variant="ghost" size="icon-sm" title={messages.common.delete}><TrashIcon className="size-3.5" /></Button>}
                    title={labels.deleteTitle}
                    description={labels.deleteDescription}
                    confirmLabel={messages.common.delete}
                    destructive
                    successMessage={labels.deleted}
                    action={deleteModule}
                    input={{ moduleId: module.id }}
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
