import { UserCheckIcon, UsersIcon } from "lucide-react"
import { StatsGrid } from "./stats-grid"
import { StatsTable } from "./stats-table"
import { analyticsMessages } from "@/lib/messages/analytics"
import { formatDateInTimeZone } from "@/lib/dates/format-in-time-zone"
import type { OrgOverviewStats, ProfessorStatsRow } from "../types"

function formatDate(value: string | null, timeZone: string): string {
  return value ? formatDateInTimeZone(value, timeZone) : analyticsMessages.admin.professors.never
}

/** Professors section of the admin dashboard (`org_overview_stats` + `org_professor_stats`). */
export function AdminProfessorsSection({
  overview,
  professors,
  timeZone,
}: {
  overview: OrgOverviewStats
  professors: ProfessorStatsRow[]
  timeZone: string
}) {
  const m = analyticsMessages.admin.professors

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{m.sectionTitle}</h2>
      <StatsGrid
        items={[
          { key: "total", label: m.total, value: overview.professorsTotal, icon: UsersIcon },
          { key: "active", label: m.active, value: overview.professorsActive, icon: UserCheckIcon },
        ]}
      />
      <StatsTable
        items={professors}
        getRowKey={(professor) => professor.professorUserId}
        titleColumn={{
          key: "name",
          header: m.tableTitleHeader,
          cell: (professor) => `${professor.firstName} ${professor.lastName}`,
        }}
        columns={[
          { key: "assigned", header: m.assignedCourses, cell: (professor) => professor.assignedCoursesCount },
          { key: "graded", header: m.attemptsGraded, cell: (professor) => professor.attemptsGradedCount },
          {
            key: "lastGraded",
            header: m.lastGradedAt,
            cell: (professor) => formatDate(professor.lastGradedAt, timeZone),
          },
          { key: "pending", header: m.pendingGrading, cell: (professor) => professor.pendingGradingCount },
        ]}
        emptyTitle={m.emptyTitle}
      />
    </section>
  )
}
