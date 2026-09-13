import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { learnMessages } from "@/lib/messages/learn"
import type { StudentModule } from "@/features/enrollments/queries/get-enrollment-course-tree"
import type { ModuleUnlockState } from "../queries/get-unlock-state"
import type { ModuleSummary } from "../queries/get-module-summary"
import { moduleStateLabel } from "../unlock-labels"
import { ModuleStateChip } from "./module-state-chip"
import { LessonList } from "./lesson-list"

interface ModuleListProps {
  enrollmentId: string
  modules: StudentModule[]
  unlockStates: Map<string, ModuleUnlockState>
  summaries: Map<string, ModuleSummary>
  timeZone: string
}

export function ModuleList({
  enrollmentId,
  modules,
  unlockStates,
  summaries,
  timeZone,
}: ModuleListProps) {
  return (
    <ul className="flex flex-col gap-3">
      {modules.map((module) => {
        const unlock = unlockStates.get(module.id)
        // A module the server did not report on is treated as locked, never as
        // open: a missing answer must never become an implicit "yes" (D17).
        const state = unlock?.state ?? "LOCKED_DEPENDENCY"
        const reason = unlock?.reason ?? learnMessages.errors.moduleLocked
        const { openable } = moduleStateLabel(state)
        const summary = summaries.get(module.id)

        return (
          <li
            key={module.id}
            className="rounded-lg border bg-card p-4"
            aria-disabled={openable ? undefined : true}
          >
            <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="font-medium leading-tight">{module.title}</h3>
                {module.description && (
                  <p className="mt-0.5 text-sm text-muted-foreground">{module.description}</p>
                )}
              </div>
              <ModuleStateChip state={state} reason={reason} />
            </div>

            <p className="mb-3 text-xs text-muted-foreground">
              {reason}
              {state === "UPCOMING" && unlock?.availableFrom
                ? ` ${learnMessages.course.availableFromPrefix} ${formatDateTimeInTimeZone(unlock.availableFrom, timeZone)}.`
                : ""}
              {state === "AVAILABLE" && unlock?.availableUntil
                ? ` ${learnMessages.course.availableUntilPrefix} ${formatDateTimeInTimeZone(unlock.availableUntil, timeZone)}.`
                : ""}
              {summary && summary.totalRequired > 0
                ? ` · ${learnMessages.progress.blocksLabel(summary.completedRequired, summary.totalRequired)}`
                : ""}
            </p>

            {openable && <LessonList enrollmentId={enrollmentId} lessons={module.lessons} />}
          </li>
        )
      })}
    </ul>
  )
}
