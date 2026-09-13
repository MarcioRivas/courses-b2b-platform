import Link from "next/link"
import { BookOpenIcon, ClipboardCheckIcon, GraduationCapIcon, UsersIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { StatCard } from "@/components/shared/stat-card"
import { ErrorState } from "@/components/shared/error-state"
import { getOrgOverview } from "@/features/analytics/queries/get-org-overview"
import { messages } from "@/lib/messages/es"
import { analyticsMessages } from "@/lib/messages/analytics"
import type { OrgOverviewStats } from "@/features/analytics/types"

/** Real numbers via `org_overview_stats` (Phase 6) — replaces the Phase 2 placeholder cards. */
export default async function AdminPage() {
  const ctx = await requireOrgRole(["ADMIN"])
  const m = analyticsMessages.home

  let overview: OrgOverviewStats | null
  try {
    overview = await getOrgOverview(ctx.organizationId)
  } catch {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader
          title={ctx.organizationName}
          description={`${messages.home.greeting}, ${ctx.profile.firstName} ${ctx.profile.lastName} · ${messages.home.admin}`}
        />
        <ErrorState title={messages.errors.INTERNAL} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={ctx.organizationName}
        description={`${messages.home.greeting}, ${ctx.profile.firstName} ${ctx.profile.lastName} · ${messages.home.admin}`}
      />
      {overview && (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <StatCard label={m.activeStudents} value={overview.studentsActive} icon={GraduationCapIcon} />
            <StatCard label={m.activeProfessors} value={overview.professorsActive} icon={UsersIcon} />
            <StatCard label={m.coursesPublished} value={overview.coursesPublished} icon={BookOpenIcon} />
            <StatCard
              label={m.pendingGrading}
              value={overview.attemptsSubmitted + overview.attemptsAutoSubmitted}
              icon={ClipboardCheckIcon}
            />
          </div>
          <Link href="/admin/analytics" className="text-sm font-medium text-primary hover:underline">
            {m.viewAnalytics}
          </Link>
        </>
      )}
    </div>
  )
}
