import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { LinkList } from "@/features/registration-links/components/link-list"
import { adminLinksMessages } from "@/lib/messages/admin-links"

interface AdminLinksPageProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function AdminLinksPage({ searchParams }: AdminLinksPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const params = await searchParams

  return (
    <div>
      <PageHeader title={adminLinksMessages.title} description={adminLinksMessages.description} />
      <LinkList organizationId={ctx.organizationId} basePath="/admin/links" searchParams={params} />
    </div>
  )
}
