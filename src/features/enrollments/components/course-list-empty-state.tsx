"use client"

import { SearchXIcon } from "lucide-react"
import { EmptyState } from "@/components/shared/empty-state"
import { Button } from "@/components/ui/button"
import { learnCoursesMessages as t } from "@/lib/messages/learn-courses"
import type { CourseListParams } from "../schemas/course-list-params-schema"

interface CourseListEmptyStateProps {
  params: CourseListParams
  onSearchAll: () => void
  onClear: () => void
}

/** What an empty grid means depends on why it is empty: a search or no data. */
export function CourseListEmptyState({ params, onSearchAll, onClear }: CourseListEmptyStateProps) {
  if (params.q) {
    return (
      <EmptyState
        icon={SearchXIcon}
        title={t.empty.noResults(params.q, t.views[params.vista])}
        action={
          <div className="flex flex-wrap justify-center gap-2">
            {params.vista !== "todos" && (
              <Button size="sm" onClick={onSearchAll}>
                {t.empty.searchAll}
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={onClear}>
              {t.empty.clearFilters}
            </Button>
          </div>
        }
      />
    )
  }

  if (params.vista === "disponibles") {
    return <EmptyState title={t.empty.noAvailable} description={t.empty.noAvailableHint} />
  }
  return <EmptyState title={t.empty.noCourses} />
}
