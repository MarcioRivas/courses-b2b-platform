"use client"

import { useId } from "react"
import { SearchIcon } from "lucide-react"
import { Input } from "@/components/ui/input"
import { learnCoursesMessages as t } from "@/lib/messages/learn-courses"
import { COURSE_VIEWS, type CourseListParams } from "../schemas/course-list-params-schema"
import { CourseFilterPills } from "./course-filter-pills"

interface CourseListToolbarProps {
  params: CourseListParams
  onQuery: (q: string) => void
  onView: (vista: CourseListParams["vista"]) => void
}

/** Search + view pills. Sticks under the app header. */
export function CourseListToolbar({ params, onQuery, onView }: CourseListToolbarProps) {
  const searchId = useId()

  return (
    <div className="sticky top-14 z-10 -mx-4 flex flex-col gap-3 bg-muted/40 px-4 py-3 backdrop-blur md:-mx-8 md:px-8">
      <div className="relative w-full sm:max-w-sm">
        <label htmlFor={searchId} className="sr-only">
          {t.search.label}
        </label>
        <SearchIcon
          aria-hidden="true"
          className="absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id={searchId}
          type="search"
          autoComplete="off"
          maxLength={100}
          value={params.q ?? ""}
          placeholder={t.search.placeholder}
          onChange={(event) => onQuery(event.target.value)}
          className="h-10 rounded-full bg-card pl-9"
        />
      </div>
      <CourseFilterPills
        label={t.views.label}
        value={params.vista}
        onChange={onView}
        options={COURSE_VIEWS.map((value) => ({ value, label: t.views[value] }))}
      />
    </div>
  )
}
