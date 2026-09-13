import Link from "next/link"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { OrgSettingsForm } from "@/features/organizations/components/org-settings-form"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { settingsMessages } from "@/lib/messages/admin-settings"

export default async function AdminSettingsPage() {
  const ctx = await requireOrgRole(["ADMIN"])
  const settings = await getOrgSettings(ctx.organizationId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={settingsMessages.page.title}>
        <Button variant="outline" render={<Link href="/admin/settings/score-scale" />}>
          {settingsMessages.page.scoreScaleLink}
        </Button>
      </PageHeader>
      <OrgSettingsForm
        settings={{
          timezone: settings?.timezone ?? "America/Montevideo",
          defaultPassingScore: settings?.defaultPassingScore ?? 60,
        }}
      />
    </div>
  )
}
