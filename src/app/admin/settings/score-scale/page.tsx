import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { ScoreScaleEditor } from "@/features/organizations/components/score-scale-editor"
import { listScoreRanges } from "@/features/organizations/queries/list-score-ranges"
import { settingsMessages } from "@/lib/messages/admin-settings"

export default async function ScoreScalePage() {
  const ctx = await requireOrgRole(["ADMIN"])
  const ranges = await listScoreRanges(ctx.organizationId)

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={settingsMessages.scoreScale.title} description={settingsMessages.scoreScale.description} />
      <ScoreScaleEditor ranges={ranges} />
    </div>
  )
}
