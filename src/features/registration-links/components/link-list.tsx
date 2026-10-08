import { getSessionContext } from "@/lib/auth/session"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Pagination } from "@/components/shared/pagination"
import { messages } from "@/lib/messages/es"
import { adminLinksMessages } from "@/lib/messages/admin-links"
import { buildListHref, firstParam, type SearchParams } from "@/lib/search-params"
import { listLinks } from "../queries/list-links"
import type { LinkListItem } from "../queries/list-links"
import { LinkForm } from "./link-form"
import { CopyLinkButton } from "./copy-link-button"
import { LinkRowActions } from "./link-row-actions"
import { LinkStateBadge } from "./link-state-badge"

interface LinkListProps {
  organizationId: string
  basePath: string
  searchParams: SearchParams
}

function formatExpiry(expiresAt: string | null): string {
  if (!expiresAt) {
    return adminLinksMessages.noExpiry
  }
  return new Date(expiresAt).toLocaleDateString("es-UY")
}

/** Registration link list: create dialog + paginated `DataList`. Shared by `/admin/links` and the platform org tabs. */
export async function LinkList({ organizationId, basePath, searchParams }: LinkListProps) {
  const ctx = await getSessionContext()
  const pageParam = firstParam(searchParams.page)
  const page = pageParam ? Number(pageParam) : undefined

  const { items, total, page: currentPage, pageSize } = await listLinks({ organizationId, page })

  const titleColumn: DataListColumn<LinkListItem> = {
    key: "label",
    header: adminLinksMessages.columns.label,
    cell: (link) => link.label ?? messages.roles[link.defaultRole],
  }

  const columns: DataListColumn<LinkListItem>[] = [
    { key: "role", header: adminLinksMessages.columns.role, cell: (link) => messages.roles[link.defaultRole] },
    { key: "state", header: adminLinksMessages.columns.state, cell: (link) => <LinkStateBadge link={link} /> },
    {
      key: "uses",
      header: adminLinksMessages.columns.uses,
      cell: (link) => link.useCount,
    },
    {
      key: "maxUses",
      header: adminLinksMessages.columns.maxUses,
      cell: (link) => link.maxUses ?? adminLinksMessages.noMaxUses,
    },
    { key: "expires", header: adminLinksMessages.columns.expires, cell: (link) => formatExpiry(link.expiresAt) },
    {
      key: "actions",
      header: adminLinksMessages.columns.actions,
      isActions: true,
      cell: (link) => (
        <div className="flex items-center gap-2">
          <CopyLinkButton token={link.token} />
          <LinkRowActions link={link} organizationId={organizationId} />
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <LinkForm organizationId={organizationId} allowAdminRole={ctx?.isPlatformAdmin ?? false} />
      </div>
      <DataList
        items={items}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(link) => link.id}
        emptyTitle={adminLinksMessages.empty.title}
        emptyDescription={adminLinksMessages.empty.description}
      />
      <Pagination
        page={currentPage}
        pageSize={pageSize}
        total={total}
        buildHref={(nextPage) =>
          buildListHref(basePath, searchParams, {
            page: nextPage > 1 ? String(nextPage) : undefined,
          })
        }
      />
    </div>
  )
}
