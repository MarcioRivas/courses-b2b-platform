import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { OrganizationForm } from "@/features/organizations/components/organization-form"
import { orgMessages } from "@/lib/messages/admin-organizations"

export default async function NewOrganizationPage() {
  await requirePlatformAdmin()

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={orgMessages.create.title} description={orgMessages.create.description} />
      <OrganizationForm />
    </div>
  )
}
