import Link from "next/link"
import { StatsTable } from "./stats-table"
import { analyticsMessages } from "@/lib/messages/analytics"
import { formatPercent } from "../lib/format-percent"
import type { PlatformOrgStatsRow } from "../types"

/** Per-org rollup for the super admin dashboard (`platform_org_stats`). */
export function PlatformRollupTable({ rows }: { rows: PlatformOrgStatsRow[] }) {
  const m = analyticsMessages.platform

  return (
    <StatsTable
      items={rows}
      getRowKey={(row) => row.organizationId}
      titleColumn={{
        key: "name",
        header: m.tableTitleHeader,
        cell: (row) => (
          <Link href={`/platform/organizations/${row.organizationId}`} className="font-medium hover:underline">
            {row.name}
          </Link>
        ),
      }}
      columns={[
        { key: "students", header: m.students, cell: (row) => row.studentsCount },
        { key: "professors", header: m.professors, cell: (row) => row.professorsCount },
        { key: "courses", header: m.courses, cell: (row) => row.coursesCount },
        { key: "enrollments", header: m.enrollments, cell: (row) => row.enrollmentsCount },
        { key: "attempts", header: m.attempts, cell: (row) => row.attemptsCount },
        { key: "avgProgress", header: m.avgProgress, cell: (row) => formatPercent(row.avgProgressPercent) },
      ]}
      emptyTitle={m.emptyTitle}
    />
  )
}
