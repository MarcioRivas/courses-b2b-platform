import {
  BookOpenIcon,
  Building2Icon,
  ClipboardListIcon,
  GraduationCapIcon,
  UserCheckIcon,
  UsersIcon,
} from "lucide-react"
import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/error-state"
import { StatsGrid } from "@/features/analytics/components/stats-grid"
import { PlatformRollupTable } from "@/features/analytics/components/platform-rollup-table"
import { getPlatformStats, type PlatformStats } from "@/features/analytics/queries/get-platform-stats"
import { messages } from "@/lib/messages/es"
import { analyticsMessages } from "@/lib/messages/analytics"

/** Super admin cross-org rollup (`platform_org_stats`) + platform totals (§39). */
export default async function PlatformPage() {
  const ctx = await requirePlatformAdmin()
  const m = analyticsMessages.platform
  const description = `${messages.home.greeting}, ${ctx.profile.firstName} ${ctx.profile.lastName}`

  let stats: PlatformStats
  try {
    stats = await getPlatformStats()
  } catch {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader icon={Building2Icon} title={messages.home.platformTitle} description={description} />
        <ErrorState title={messages.errors.INTERNAL} />
      </div>
    )
  }
  const { rows, totals } = stats

  return (
    <div className="flex flex-col gap-6">
      <PageHeader icon={Building2Icon} title={messages.home.platformTitle} description={description} />

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{m.totalsSectionTitle}</h2>
        <StatsGrid
          items={[
            { key: "organizations", label: m.organizations, value: totals.organizations, icon: Building2Icon },
            { key: "students", label: m.students, value: totals.students, icon: GraduationCapIcon },
            { key: "professors", label: m.professors, value: totals.professors, icon: UsersIcon },
            { key: "courses", label: m.courses, value: totals.courses, icon: BookOpenIcon },
            { key: "enrollments", label: m.enrollments, value: totals.enrollments, icon: UserCheckIcon },
            { key: "attempts", label: m.attempts, value: totals.attempts, icon: ClipboardListIcon },
          ]}
        />
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">{m.rollupSectionTitle}</h2>
        <PlatformRollupTable rows={rows} />
      </section>
    </div>
  )
}
