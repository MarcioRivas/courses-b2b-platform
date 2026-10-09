import { StatsTable } from "./stats-table"
import { SimpleBarChart } from "./simple-bar-chart"
import { analyticsMessages } from "@/lib/messages/analytics"
import { formatPercent } from "../lib/format-percent"
import type { ProfessorOverviewRow } from "../types"

/**
 * `/teach` overview: one row per edition the professor teaches, via
 * `professor_overview_stats` (no `p_org` — B12, never org-wide numbers).
 */
export function ProfessorOverviewList({ offerings }: { offerings: ProfessorOverviewRow[] }) {
  const m = analyticsMessages.professor

  if (offerings.length === 0) {
    return (
      <div className="rounded-2xl border bg-card p-5 text-sm text-muted-foreground shadow-card">
        <p className="font-medium text-foreground">{m.emptyTitle}</p>
        <p>{m.emptyDescription}</p>
      </div>
    )
  }

  const attemptsByStatus = [
    { label: analyticsMessages.attemptStatus.IN_PROGRESS, value: sum(offerings, "attemptsInProgress") },
    { label: analyticsMessages.attemptStatus.SUBMITTED, value: sum(offerings, "attemptsSubmitted") },
    { label: analyticsMessages.attemptStatus.AUTO_SUBMITTED, value: sum(offerings, "attemptsAutoSubmitted") },
    { label: analyticsMessages.attemptStatus.GRADED, value: sum(offerings, "attemptsGraded") },
  ]

  return (
    <div className="flex flex-col gap-6">
      <StatsTable
        items={offerings}
        getRowKey={(offering) => offering.offeringId}
        titleColumn={{ key: "title", header: m.tableTitleHeader, cell: (offering) => offering.offeringName }}
        columns={[
          { key: "course", header: m.course, cell: (offering) => offering.courseTitle },
          { key: "enrolled", header: m.enrolled, cell: (offering) => offering.enrolledCount },
          {
            key: "avgProgress",
            header: m.avgProgress,
            cell: (offering) => formatPercent(offering.avgProgressPercent),
          },
          { key: "pending", header: m.pendingGrading, cell: (offering) => offering.pendingGradingCount },
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

function sum(offerings: ProfessorOverviewRow[], key: AttemptCountKey): number {
  return offerings.reduce((total, offering) => total + offering[key], 0)
}
