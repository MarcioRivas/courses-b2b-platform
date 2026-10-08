"use client"

import { useTransition } from "react"
import Link from "next/link"
import { toast } from "sonner"
import { contentMessages } from "@/lib/messages/admin-content"
import { reorderModules } from "../actions/reorder-modules"
import { DependencyChips } from "./dependency-chips"
import { ModuleRowActions } from "./module-row-actions"
import type { ModuleDependencyItem } from "./dependency-editor"

export interface ModuleRowItem {
  id: string
  title: string
  description: string | null
  lessonCount: number
  dependencies: ModuleDependencyItem[]
}

interface ModuleListProps {
  offeringId: string
  basePath: string
  modules: ModuleRowItem[]
  canEdit: boolean
}

/** Ordered module rows: number · title (link) · 1-line description · counters · dependency chips · actions. */
export function ModuleList({ offeringId, basePath, modules, canEdit }: ModuleListProps) {
  const [isPending, startTransition] = useTransition()
  const labels = contentMessages.builder
  const moduleTitles = Object.fromEntries(modules.map((m) => [m.id, m.title]))

  function move(index: number, direction: -1 | 1) {
    const target = index + direction
    if (target < 0 || target >= modules.length) return

    const orderedIds = modules.map((m) => m.id)
    ;[orderedIds[index], orderedIds[target]] = [orderedIds[target] as string, orderedIds[index] as string]

    startTransition(async () => {
      const result = await reorderModules({ offeringId, orderedIds })
      if (!result.ok) toast.error(result.message)
    })
  }

  return (
    <ol className="flex flex-col gap-2" aria-label={labels.modulesTitle}>
      {modules.map((module, index) => (
        <li
          key={module.id}
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
                href={`${basePath}/${module.id}`}
                className="line-clamp-2 w-fit max-w-full text-base font-semibold text-foreground hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"
              >
                {module.title}
              </Link>
              {module.description && (
                <p className="line-clamp-1 text-sm text-muted-foreground">{module.description}</p>
              )}
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                <span className="text-xs font-medium text-muted-foreground tabular-nums">
                  {labels.lessonCount(module.lessonCount)}
                </span>
                <DependencyChips dependencies={module.dependencies} moduleTitles={moduleTitles} />
              </div>
            </div>
          </div>

          {canEdit && (
            <div className="shrink-0 pl-11 sm:pl-0">
              <ModuleRowActions
                offeringId={offeringId}
                module={module}
                otherModules={modules.filter((m) => m.id !== module.id).map((m) => ({ id: m.id, title: m.title }))}
                onMove={(direction) => move(index, direction)}
                canMoveUp={index > 0}
                canMoveDown={index < modules.length - 1}
                isPending={isPending}
              />
            </div>
          )}
        </li>
      ))}
    </ol>
  )
}
