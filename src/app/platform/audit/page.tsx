import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/error-state"
import { Pagination } from "@/components/shared/pagination"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { listAuditLogs } from "@/features/audit/queries/list-audit-logs"
import { listAuditActions } from "@/features/audit/queries/list-audit-actions"
import { listOrganizations } from "@/features/organizations/queries/list-organizations"
import { AuditTable } from "@/features/audit/components/audit-table"
import { AuditFilters } from "@/features/audit/components/audit-filters"
import { parseAuditFilters } from "@/features/audit/schemas/audit-filter-schemas"
import { auditMessages } from "@/lib/messages/audit"
import { messages } from "@/lib/messages/es"
import { buildListHref, firstParam, type SearchParams } from "@/lib/search-params"

interface PlatformAuditPageProps {
  searchParams: Promise<SearchParams>
}

/** Cross-org audit log (§40): every organization's events, optionally narrowed by `?organizationId=`. */
export default async function PlatformAuditPage({ searchParams }: PlatformAuditPageProps) {
  await requirePlatformAdmin()
  const sp = await searchParams

  const filters = parseAuditFilters({
    organizationId: firstParam(sp.organizationId),
    actor: firstParam(sp.actor),
    action: firstParam(sp.action),
    entityType: firstParam(sp.entityType),
    from: firstParam(sp.from),
    to: firstParam(sp.to),
    page: firstParam(sp.page),
  })

  let result, actionOptions, organizations
  try {
    ;[result, actionOptions, organizations] = await Promise.all([
      listAuditLogs(filters),
      listAuditActions(filters.organizationId),
      listOrganizations({ page: 1, q: undefined }),
    ])
  } catch {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={auditMessages.platform.pageTitle} />
        <ErrorState title={messages.errors.INTERNAL} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={auditMessages.platform.pageTitle} description={auditMessages.platform.pageDescription} />
      <AuditFilters actionOptions={actionOptions} organizations={organizations.items} />
      <AuditTable items={result.items} timeZone={DEFAULT_TIME_ZONE} showOrganization />
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        buildHref={(nextPage) =>
          buildListHref("/platform/audit", sp, { page: nextPage > 1 ? String(nextPage) : undefined })
        }
      />
    </div>
  )
}
