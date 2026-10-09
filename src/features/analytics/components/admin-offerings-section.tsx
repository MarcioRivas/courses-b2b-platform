import { StatsTable } from "./stats-table"
import { OfferingStatsCourseFilter } from "./offering-stats-course-filter"
import { analyticsMessages } from "@/lib/messages/analytics"
import { formatPercent } from "../lib/format-percent"
import type { OfferingStatsRow } from "../types"

/**
 * "Por edición" section of the admin dashboard (`org_offering_stats`), with a
 * course filter driven by `?course=<uuid>` (validated by the page).
 */
export function AdminOfferingsSection({
  offerings,
  courses,
}: {
  offerings: OfferingStatsRow[]
  courses: { id: string; title: string }[]
}) {
  const m = analyticsMessages.admin.offerings

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{m.sectionTitle}</h2>
      <OfferingStatsCourseFilter courses={courses} />
      <StatsTable
        items={offerings}
        getRowKey={(offering) => offering.offeringId}
        titleColumn={{ key: "title", header: m.tableTitleHeader, cell: (offering) => offering.offeringName }}
        columns={[
          { key: "course", header: m.course, cell: (offering) => offering.courseTitle },
          { key: "group", header: m.group, cell: (offering) => offering.groupName ?? m.noGroup },
          { key: "enrolled", header: m.enrolled, cell: (offering) => offering.enrolledCount },
          {
            key: "avgProgress",
            header: m.avgProgress,
            cell: (offering) => formatPercent(offering.avgProgressPercent),
          },
          { key: "attempts", header: m.attempts, cell: (offering) => offering.attemptsCount },
          { key: "pending", header: m.pendingGrading, cell: (offering) => offering.pendingGradingCount },
        ]}
        emptyTitle={m.emptyTitle}
      />
    </section>
  )
}
