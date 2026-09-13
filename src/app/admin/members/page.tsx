import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { MemberList } from "@/features/users/components/member-list"
import { adminMembersMessages } from "@/lib/messages/admin-members"

interface AdminMembersPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminMembersPage({ searchParams }: AdminMembersPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const params = await searchParams

  return (
    <div>
      <PageHeader
        title={adminMembersMessages.title}
        description={adminMembersMessages.description(ctx.organizationName)}
      />
      <MemberList organizationId={ctx.organizationId} basePath="/admin/members" searchParams={params} />
    </div>
  )
}
