"use client"

import { useMemo, useState } from "react"
import { buildCourseList } from "../lib/student-course-list"
import { filterCourseList } from "../lib/filter-student-courses"
import { useCourseListParams } from "../hooks/use-course-list-params"
import type { AvailableCourse, StudentEnrollment } from "../types"
import { learnCoursesMessages as t } from "@/lib/messages/learn-courses"
import { CourseListToolbar } from "./course-list-toolbar"
import { CourseListEmptyState } from "./course-list-empty-state"
import { StudentCourseCard } from "./student-course-card"

interface StudentCoursesBrowserProps {
  enrollments: StudentEnrollment[]
  available: AvailableCourse[]
  timeZone: string
}

/**
 * The student's single "Cursos" screen: search + pills over one grid. All filtering happens here in memory (see filter-student-courses.ts).
 */
export function StudentCoursesBrowser({ enrollments, available, timeZone }: StudentCoursesBrowserProps) {
  const hasEnrollments = enrollments.length > 0
  const { params, setView, setQuery, clear } = useCourseListParams(hasEnrollments)
  // Fixed while the screen is open, so a card never changes state mid-search.
  const [now] = useState(() => new Date())

  const items = useMemo(() => buildCourseList(enrollments, available, now), [enrollments, available, now])
  const shown = useMemo(() => filterCourseList(items, params), [items, params])

  return (
    <div className="flex flex-col gap-6">

      <div className="flex flex-col gap-4">
        {!hasEnrollments && params.vista === "disponibles" && (
          <h2 className="text-base font-semibold tracking-tight">{t.firstCourseTitle}</h2>
        )}
        <CourseListToolbar params={params} onQuery={setQuery} onView={setView} />

        <p role="status" aria-live="polite" className="sr-only">
          {t.results(shown.length)}
        </p>

        {shown.length === 0 ? (
          <CourseListEmptyState params={params} onSearchAll={() => setView("todos")} onClear={clear} />
        ) : (
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {shown.map((item) => (
              <li key={item.key} className="flex">
                <div className="flex w-full flex-col [&>article]:flex-1">
                  <StudentCourseCard
                    item={item}
                    timeZone={timeZone}
                    // Enrolling from "Disponibles" moves the course out of that view: follow it.
                    onEnrolled={() => params.vista === "disponibles" && setView("todos")}
                  />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
