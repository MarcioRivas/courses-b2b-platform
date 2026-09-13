import { CheckCircle2Icon, GraduationCapIcon, UserCheckIcon, UsersIcon } from "lucide-react"
import { StatsGrid } from "./stats-grid"
import { analyticsMessages } from "@/lib/messages/analytics"
import type { OrgOverviewStats } from "../types"

/** Students section of the admin dashboard (`org_overview_stats`). */
export function AdminStudentsSection({ overview }: { overview: OrgOverviewStats }) {
  const m = analyticsMessages.admin.students

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-semibold">{m.sectionTitle}</h2>
      <StatsGrid
        items={[
          { key: "total", label: m.total, value: overview.studentsTotal, icon: UsersIcon },
          { key: "active", label: m.active, value: overview.studentsActive, icon: UserCheckIcon },
          {
            key: "enrolled",
            label: m.withEnrollment,
            value: overview.studentsWithEnrollment,
            icon: GraduationCapIcon,
          },
          {
            key: "completed",
            label: m.completedCourse,
            value: overview.studentsCompletedCourse,
            icon: CheckCircle2Icon,
          },
        ]}
      />
    </section>
  )
}
