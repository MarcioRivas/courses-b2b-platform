import Link from "next/link"
import { getSessionContext } from "@/lib/auth/session"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Pagination } from "@/components/shared/pagination"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"
import { adminMembersMessages } from "@/lib/messages/admin-members"
import { buildListHref, firstParam, type SearchParams } from "@/lib/search-params"
import { listMembers } from "../queries/list-members"
import { memberFiltersSchema } from "../schemas/user-schemas"
import type { MemberListItem } from "../queries/list-members"
import { MemberFilters } from "./member-filters"
import { RoleBadge } from "./role-badge"
import { MemberRoleDialog } from "./member-role-dialog"
import { MemberStatusToggle } from "./member-status-toggle"

interface MemberListProps {
  organizationId: string
  /** Where filter/pagination links point, e.g. "/admin/members" or "/platform/organizations/<id>". */
  basePath: string
  searchParams: SearchParams
}

/** Member directory: filters + paginated `DataList`. Shared by `/admin/members` and the platform org tabs. */
export async function MemberList({ organizationId, basePath, searchParams }: MemberListProps) {
  const ctx = await getSessionContext()
  const parsedFilters = memberFiltersSchema.safeParse({
    role: firstParam(searchParams.role),
    status: firstParam(searchParams.status),
    search: firstParam(searchParams.q),
    page: firstParam(searchParams.page),
  })
  const filters = parsedFilters.success ? parsedFilters.data : {}

  const { items, total, page, pageSize } = await listMembers({ organizationId, ...filters })

  const canLinkToDetail = basePath.startsWith("/admin")
  const currentUserId = ctx?.user.id

  const titleColumn: DataListColumn<MemberListItem> = {
    key: "name",
    header: adminMembersMessages.columns.name,
    cell: (member) => member.fullName,
  }

  const columns: DataListColumn<MemberListItem>[] = [
    { key: "email", header: adminMembersMessages.columns.email, cell: (member) => member.email ?? "—" },
    { key: "dni", header: adminMembersMessages.columns.dni, cell: (member) => member.dni ?? "—" },
    { key: "role", header: adminMembersMessages.columns.role, cell: (member) => <RoleBadge role={member.role} /> },
    {
      key: "status",
      header: adminMembersMessages.columns.status,
      cell: (member) => (
        <Badge variant={member.status === "ACTIVE" ? "secondary" : "outline"}>
          {messages.memberStatus[member.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: adminMembersMessages.columns.actions,
      isActions: true,
      // /admin: only "Ver"; role, status and profile are edited on the detail page.
      // The platform org tab has no detail page, so it keeps the inline controls.
      cell: (member) =>
        canLinkToDetail ? (
          <Button variant="outline" size="sm" render={<Link href={`${basePath}/${member.userId}`} />}>
            {adminMembersMessages.viewAction}
          </Button>
        ) : member.userId === currentUserId ? null : (
          <div className="flex items-center gap-2">
            <MemberRoleDialog
              membershipId={member.membershipId}
              memberName={member.fullName}
              currentRole={member.role}
              organizationId={organizationId}
            />
            <MemberStatusToggle
              membershipId={member.membershipId}
              memberName={member.fullName}
              status={member.status}
              organizationId={organizationId}
            />
          </div>
        ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <MemberFilters />
      <DataList
        items={items}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(member) => member.membershipId}
        emptyTitle={adminMembersMessages.empty.title}
        emptyDescription={adminMembersMessages.empty.description}
      />
      <Pagination
        page={page}
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
