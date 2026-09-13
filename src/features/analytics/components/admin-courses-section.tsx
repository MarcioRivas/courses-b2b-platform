import { ArchiveIcon, BookOpenIcon, FileIcon } from "lucide-react"
import { StatsGrid } from "./stats-grid"
import { StatsTable } from "./stats-table"
import { CourseStatusBadge } from "@/features/courses/components/course-status-badge"
import { analyticsMessages } from "@/lib/messages/analytics"
import { formatDateInTimeZone } from "@/lib/dates/format-in-time-zone"
import { formatPercent } from "../lib/format-percent"
import type { CourseStatsRow, OrgOverviewStats } from "../types"

function formatDate(value: string | null, timeZone: string): string {
  return value ? formatDateInTimeZone(value, timeZone) : analyticsMessages.admin.courses.never
}

/** Courses section of the admin dashboard (`org_overview_stats` + `org_course_stats`). */
export function AdminCoursesSection({
  overview,
  courses,
  timeZone,
}: {
  overview: OrgOverviewStats
  courses: CourseStatsRow[]
  timeZone: string
}) {
  const m = analyticsMessages.admin.courses

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{m.sectionTitle}</h2>
      <StatsGrid
        items={[
          { key: "draft", label: m.draft, value: overview.coursesDraft, icon: FileIcon },
          { key: "published", label: m.published, value: overview.coursesPublished, icon: BookOpenIcon },
          { key: "archived", label: m.archived, value: overview.coursesArchived, icon: ArchiveIcon },
        ]}
      />
      <StatsTable
        items={courses}
        getRowKey={(course) => course.courseId}
        titleColumn={{ key: "title", header: m.tableTitleHeader, cell: (course) => course.courseTitle }}
        columns={[
          { key: "status", header: m.status, cell: (course) => <CourseStatusBadge status={course.status} /> },
          { key: "offerings", header: m.offerings, cell: (course) => course.offeringsCount },
          { key: "enrolled", header: m.enrolled, cell: (course) => course.enrolledCount },
          { key: "avgProgress", header: m.avgProgress, cell: (course) => formatPercent(course.avgProgressPercent) },
          { key: "completion", header: m.completionRate, cell: (course) => formatPercent(course.completionRate) },
          {
            key: "lastActivity",
            header: m.lastActivity,
            cell: (course) => formatDate(course.lastActivity, timeZone),
          },
        ]}
        emptyTitle={m.emptyTitle}
      />
    </section>
  )
}
