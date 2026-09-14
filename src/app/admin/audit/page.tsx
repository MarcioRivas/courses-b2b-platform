import { requireOrgRole } from "@/lib/auth/require-role"
import { resolveAdminOrgScope } from "@/lib/auth/resolve-admin-org-scope"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/error-state"
import { Pagination } from "@/components/shared/pagination"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { listAuditLogs } from "@/features/audit/queries/list-audit-logs"
import { listAuditActions } from "@/features/audit/queries/list-audit-actions"
import { AuditTable } from "@/features/audit/components/audit-table"
import { AuditFilters } from "@/features/audit/components/audit-filters"
import { parseAuditFilters } from "@/features/audit/schemas/audit-filter-schemas"
import { auditMessages } from "@/lib/messages/audit"
import { messages } from "@/lib/messages/es"
import { buildListHref, firstParam, type SearchParams } from "@/lib/search-params"

interface AdminAuditPageProps {
  searchParams: Promise<SearchParams>
}

/**
 * Org-scoped audit log (§40). `requireOrgRole` already pins everyone but a
 * dual-role platform admin to their own org; `resolveAdminOrgScope` (D23) is
 * what lets that platform admin pass `?organizationId=` to inspect a
 * different tenant's log, the same guard the mutating admin actions use.
 */
export default async function AdminAuditPage({ searchParams }: AdminAuditPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const sp = await searchParams

  const scope = resolveAdminOrgScope(ctx, firstParam(sp.organizationId))
  if (!scope.ok) {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={auditMessages.admin.pageTitle} />
        <ErrorState title={messages.errors[scope.code]} />
      </div>
    )
  }

  const filters = parseAuditFilters({
    actor: firstParam(sp.actor),
    action: firstParam(sp.action),
    entityType: firstParam(sp.entityType),
    from: firstParam(sp.from),
    to: firstParam(sp.to),
    page: firstParam(sp.page),
  })

  let result, actionOptions, settings
  try {
    ;[result, actionOptions, settings] = await Promise.all([
      listAuditLogs({ organizationId: scope.organizationId, ...filters }),
      listAuditActions(scope.organizationId),
      getOrgSettings(scope.organizationId),
    ])
  } catch {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={auditMessages.admin.pageTitle} />
        <ErrorState title={messages.errors.INTERNAL} />
      </div>
    )
  }

  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={auditMessages.admin.pageTitle} description={auditMessages.admin.pageDescription} />
      <AuditFilters actionOptions={actionOptions} />
      <AuditTable items={result.items} timeZone={timeZone} />
      <Pagination
        page={result.page}
        pageSize={result.pageSize}
        total={result.total}
        buildHref={(nextPage) =>
          buildListHref("/admin/audit", sp, { page: nextPage > 1 ? String(nextPage) : undefined })
        }
      />
    </div>
  )
}
