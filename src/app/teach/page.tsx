import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/error-state"
import { getProfessorOverview } from "@/features/analytics/queries/get-professor-overview"
import { ProfessorOverviewList } from "@/features/analytics/components/professor-overview-list"
import { messages } from "@/lib/messages/es"
import { analyticsMessages } from "@/lib/messages/analytics"
import type { ProfessorOverviewRow } from "@/features/analytics/types"

/** Professor overview (`professor_overview_stats`, B12) — own courses only, never org-wide numbers. */
export default async function TeachPage() {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const description = `${messages.home.greeting}, ${ctx.profile.firstName} ${ctx.profile.lastName} · ${messages.home.professor} · ${analyticsMessages.professor.pageDescriptionSuffix}`

  let courses: ProfessorOverviewRow[]
  try {
    courses = await getProfessorOverview()
  } catch {
    return (
      <div className="flex flex-col gap-6">
        <PageHeader title={ctx.organizationName} description={description} />
        <ErrorState title={messages.errors.INTERNAL} />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title={ctx.organizationName} description={description} />
      <ProfessorOverviewList courses={courses} />
    </div>
  )
}
