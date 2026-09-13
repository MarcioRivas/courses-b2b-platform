import { StatsTable } from "./stats-table"
import { SimpleBarChart } from "./simple-bar-chart"
import { analyticsMessages } from "@/lib/messages/analytics"
import { formatPercent } from "../lib/format-percent"
import type { ProfessorOverviewRow } from "../types"

/**
 * `/teach` overview: the professor's own courses only, via
 * `professor_overview_stats` (no `p_org` — B12, never org-wide numbers).
 */
export function ProfessorOverviewList({ courses }: { courses: ProfessorOverviewRow[] }) {
  const m = analyticsMessages.professor

  if (courses.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-4 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{m.emptyTitle}</p>
        <p>{m.emptyDescription}</p>
      </div>
    )
  }

  const attemptsByStatus = [
    { label: analyticsMessages.attemptStatus.IN_PROGRESS, value: sum(courses, "attemptsInProgress") },
    { label: analyticsMessages.attemptStatus.SUBMITTED, value: sum(courses, "attemptsSubmitted") },
    { label: analyticsMessages.attemptStatus.AUTO_SUBMITTED, value: sum(courses, "attemptsAutoSubmitted") },
    { label: analyticsMessages.attemptStatus.GRADED, value: sum(courses, "attemptsGraded") },
  ]

  return (
    <div className="flex flex-col gap-6">
      <StatsTable
        items={courses}
        getRowKey={(course) => course.courseId}
        titleColumn={{ key: "title", header: m.tableTitleHeader, cell: (course) => course.courseTitle }}
        columns={[
          { key: "enrolled", header: m.enrolled, cell: (course) => course.enrolledCount },
          { key: "avgProgress", header: m.avgProgress, cell: (course) => formatPercent(course.avgProgressPercent) },
          { key: "pending", header: m.pendingGrading, cell: (course) => course.pendingGradingCount },
        ]}
        emptyTitle={m.emptyTitle}
      />
      <div className="rounded-lg border bg-card p-4">
        <h2 className="mb-3 text-sm font-medium">{m.attemptsChartTitle}</h2>
        <SimpleBarChart title={m.attemptsChartTitle} data={attemptsByStatus} />
      </div>
    </div>
  )
}

type AttemptCountKey = "attemptsInProgress" | "attemptsSubmitted" | "attemptsAutoSubmitted" | "attemptsGraded"

function sum(courses: ProfessorOverviewRow[], key: AttemptCountKey): number {
  return courses.reduce((total, course) => total + course[key], 0)
}
