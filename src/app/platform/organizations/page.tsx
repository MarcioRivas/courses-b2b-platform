import Link from "next/link"
import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { SearchInput } from "@/components/shared/search-input"
import { Pagination } from "@/components/shared/pagination"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { listOrganizations, ORGANIZATIONS_PAGE_SIZE } from "@/features/organizations/queries/list-organizations"
import type { OrganizationListItem } from "@/features/organizations/types"
import { orgMessages } from "@/lib/messages/admin-organizations"
import { buildListHref } from "@/lib/search-params"
import { messages } from "@/lib/messages/es"

interface OrganizationsPageProps {
  searchParams: Promise<{ page?: string; q?: string }>
}

export default async function OrganizationsPage({ searchParams }: OrganizationsPageProps) {
  await requirePlatformAdmin()
  const sp = await searchParams
  const page = Math.max(1, Number(sp.page) || 1)
  const q = sp.q?.trim() || undefined

  const { items, total } = await listOrganizations({ page, q })

  const titleColumn: DataListColumn<OrganizationListItem> = {
    key: "name",
    header: orgMessages.list.nameHeader,
    cell: (org) => (
      <Link href={`/platform/organizations/${org.id}`} className="hover:underline">
        {org.name}
      </Link>
    ),
  }

  const columns: DataListColumn<OrganizationListItem>[] = [
    { key: "slug", header: orgMessages.list.slugHeader, cell: (org) => org.slug },
    {
      key: "status",
      header: orgMessages.list.statusHeader,
      cell: (org) => (
        <Badge variant={org.status === "ACTIVE" ? "default" : "secondary"}>{orgMessages.status[org.status]}</Badge>
      ),
    },
    { key: "members", header: orgMessages.list.membersHeader, cell: (org) => org.memberCount },
    {
      key: "actions",
      header: messages.common.edit,
      isActions: true,
      cell: (org) => (
        <Button variant="outline" size="sm" render={<Link href={`/platform/organizations/${org.id}`} />}>
          {orgMessages.list.viewAction}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={orgMessages.list.title}>
        <Button render={<Link href="/platform/organizations/new" />}>{orgMessages.list.createAction}</Button>
      </PageHeader>
      <SearchInput placeholder={orgMessages.list.searchPlaceholder} />
      <DataList
        items={items}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(org) => org.id}
        emptyTitle={orgMessages.list.emptyTitle}
      />
      <Pagination
        page={page}
        pageSize={ORGANIZATIONS_PAGE_SIZE}
        total={total}
        buildHref={(nextPage) =>
          buildListHref("/platform/organizations", sp, {
            page: nextPage > 1 ? String(nextPage) : undefined,
          })
        }
      />
    </div>
  )
}
