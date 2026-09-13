import Link from "next/link"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { learnMessages } from "@/lib/messages/learn"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { listMyEnrollments } from "@/features/enrollments/queries/list-my-enrollments"
import { EnrollmentSection } from "@/features/enrollments/components/enrollment-section"
import { PendingResultsStrip } from "@/features/attempts/components/pending-results-strip"

export default async function LearnPage() {
  const ctx = await requireOrgRole(["STUDENT"])

  const [buckets, settings] = await Promise.all([
    listMyEnrollments(),
    getOrgSettings(ctx.organizationId),
  ])

  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  return (
    <>
      <PageHeader
        title={learnMessages.dashboard.title}
        description={learnMessages.dashboard.description}
      >
        <Link
          href="/learn/catalog"
          className="text-sm font-medium text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {learnMessages.dashboard.browseCatalog}
        </Link>
      </PageHeader>

      <div className="flex flex-col gap-8">
        <PendingResultsStrip
          activeEnrollments={[...buckets.assigned.active, ...buckets.free.active].map((enrollment) => ({
            id: enrollment.id,
            courseTitle: enrollment.courseTitle,
          }))}
        />
        <EnrollmentSection
          title={learnMessages.dashboard.assignedTitle}
          active={buckets.assigned.active}
          finished={buckets.assigned.finished}
          emptyMessage={learnMessages.dashboard.emptyAssigned}
          timeZone={timeZone}
        />
        <EnrollmentSection
          title={learnMessages.dashboard.freeTitle}
          active={buckets.free.active}
          finished={buckets.free.finished}
          emptyMessage={learnMessages.dashboard.emptyFree}
          timeZone={timeZone}
        />
      </div>
    </>
  )
}
