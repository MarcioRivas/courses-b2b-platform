import Link from "next/link"
import { notFound } from "next/navigation"
import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { firstParam } from "@/lib/search-params"
import { getOrganization } from "@/features/organizations/queries/get-organization"
import { MemberList } from "@/features/users/components/member-list"
import { LinkList } from "@/features/registration-links/components/link-list"
import { orgMessages } from "@/lib/messages/admin-organizations"
import { getOrgOverview } from "@/features/analytics/queries/get-org-overview"
import { StatsGrid } from "@/features/analytics/components/stats-grid"
import { ErrorState } from "@/components/shared/error-state"
import { analyticsMessages } from "@/lib/messages/analytics"
import { messages } from "@/lib/messages/es"
import type { OrgOverviewStats } from "@/features/analytics/types"
import { DetalleTab } from "./_components/detalle-tab"

interface OrganizationDetailPageProps {
  params: Promise<{ orgId: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const TABS = ["detalle", "miembros", "links"] as const
type TabKey = (typeof TABS)[number]

function tabLabel(tab: TabKey): string {
  return tab === "detalle"
    ? orgMessages.detail.tabs.detail
    : tab === "miembros"
      ? orgMessages.detail.tabs.members
      : orgMessages.detail.tabs.links
}

/**
 * Tabs are URL state, not client state: the member and link tabs paginate
 * through the same `page` query param, so a client-side tab would be reset by
 * its own "Siguiente" link and would apply that page to the other tab. Only
 * the active tab renders, which also avoids querying members and links on
 * every visit.
 */
export default async function OrganizationDetailPage({
  params,
  searchParams,
}: OrganizationDetailPageProps) {
  await requirePlatformAdmin()
  const { orgId } = await params
  const sp = await searchParams

  const organization = await getOrganization(orgId)
  if (!organization) {
    return notFound()
  }

  // `org_overview_stats` accepts an explicit org id from a platform admin
  // (D25's one exception: narrowing, never widening); no per-org analytics
  // page ships (D34) — a compact grid here is the whole surface.
  let overview: OrgOverviewStats | null
  try {
    overview = await getOrgOverview(orgId)
  } catch {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader title={organization.name} description={orgMessages.status[organization.status]} />
        <ErrorState title={messages.errors.INTERNAL} />
      </div>
    )
  }

  const requestedTab = firstParam(sp.tab)
  const activeTab: TabKey = TABS.includes(requestedTab as TabKey) ? (requestedTab as TabKey) : "detalle"

  const basePath = `/platform/organizations/${orgId}`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={organization.name} description={orgMessages.status[organization.status]} />

      {overview && (
        <section className="flex flex-col gap-3">
          <h2 className="text-lg font-semibold">{analyticsMessages.admin.pageTitle}</h2>
          <StatsGrid
            items={[
              { key: "students", label: analyticsMessages.home.activeStudents, value: overview.studentsActive },
              { key: "professors", label: analyticsMessages.home.activeProfessors, value: overview.professorsActive },
              { key: "courses", label: analyticsMessages.home.coursesPublished, value: overview.coursesPublished },
              {
                key: "pending",
                label: analyticsMessages.home.pendingGrading,
                value: overview.attemptsSubmitted + overview.attemptsAutoSubmitted,
              },
            ]}
          />
        </section>
      )}

      <nav className="flex gap-1 border-b" aria-label={orgMessages.detail.tabsLabel}>
        {TABS.map((tab) => (
          <Link
            key={tab}
            // Switching tabs drops `page` and the member filters: they belong
            // to the tab being left.
            href={tab === "detalle" ? basePath : `${basePath}?tab=${tab}`}
            aria-current={tab === activeTab ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab === activeTab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tabLabel(tab)}
          </Link>
        ))}
      </nav>

      {activeTab === "detalle" && <DetalleTab organization={organization} />}
      {activeTab === "miembros" && (
        <MemberList organizationId={orgId} basePath={basePath} searchParams={sp} />
      )}
      {activeTab === "links" && (
        <LinkList organizationId={orgId} basePath={basePath} searchParams={sp} />
      )}
    </div>
  )
}
