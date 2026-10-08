import Link from "next/link"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Pagination } from "@/components/shared/pagination"
import { SearchInput } from "@/components/shared/search-input"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"
import { groupMessages } from "@/lib/messages/admin-groups"
import { buildListHref } from "@/lib/search-params"
import { listGroups, GROUPS_PAGE_SIZE } from "../queries/list-groups"
import type { GroupListItem } from "../types"
import { GroupForm } from "./group-form"

interface GroupListProps {
  organizationId: string
  basePath: string
  searchParams: Record<string, string | string[] | undefined>
}

/** Self-contained async Server Component: own query, search, pagination (mirrors Part B's MemberList/LinkList contract). */
export async function GroupList({ organizationId, basePath, searchParams }: GroupListProps) {
  const page = Math.max(1, Number(searchParams.page) || 1)
  const rawQ = searchParams.q
  const q = (typeof rawQ === "string" ? rawQ.trim() : "") || undefined

  const { items, total } = await listGroups({ organizationId, page, q })

  const titleColumn: DataListColumn<GroupListItem> = {
    key: "name",
    header: groupMessages.list.nameHeader,
    cell: (group) => group.name,
  }

  const columns: DataListColumn<GroupListItem>[] = [
    {
      key: "members",
      header: groupMessages.list.membersHeader,
      cell: (group) => groupMessages.list.memberCount(group.memberCount),
    },
    {
      key: "actions",
      header: messages.common.actions,
      isActions: true,
      // Only "Ver": editing and deleting happen on the group page.
      cell: (group) => (
        <Button variant="outline" size="sm" render={<Link href={`/admin/groups/${group.id}`} />}>
          {groupMessages.list.viewAction}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput placeholder={groupMessages.list.searchPlaceholder} />
        <GroupForm mode="create" trigger={<Button>{groupMessages.list.createAction}</Button>} />
      </div>
      <DataList
        items={items}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(group) => group.id}
        emptyTitle={groupMessages.list.emptyTitle}
      />
      <Pagination
        page={page}
        pageSize={GROUPS_PAGE_SIZE}
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
