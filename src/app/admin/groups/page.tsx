import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { GroupList } from "@/features/groups/components/group-list"
import { groupMessages } from "@/lib/messages/admin-groups"

interface GroupsPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function GroupsPage({ searchParams }: GroupsPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const sp = await searchParams

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={groupMessages.list.title} />
      <GroupList organizationId={ctx.organizationId} basePath="/admin/groups" searchParams={sp} />
    </div>
  )
}
