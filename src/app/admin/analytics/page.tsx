import { z } from "zod"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { ErrorState } from "@/components/shared/error-state"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { getOrgOverview } from "@/features/analytics/queries/get-org-overview"
import { getCourseStats } from "@/features/analytics/queries/get-course-stats"
import { getProfessorStats } from "@/features/analytics/queries/get-professor-stats"
import { getAssessmentStats } from "@/features/analytics/queries/get-assessment-stats"
import { getScoreDistribution } from "@/features/analytics/queries/get-score-distribution"
import { AdminStudentsSection } from "@/features/analytics/components/admin-students-section"
import { AdminCoursesSection } from "@/features/analytics/components/admin-courses-section"
import { AdminProfessorsSection } from "@/features/analytics/components/admin-professors-section"
import { AdminAssessmentsSection } from "@/features/analytics/components/admin-assessments-section"
import { analyticsMessages } from "@/lib/messages/analytics"
import { messages } from "@/lib/messages/es"
import { firstParam, type SearchParams } from "@/lib/search-params"

interface AdminAnalyticsPageProps {
  searchParams: Promise<SearchParams>
}

/**
 * Org admin dashboard (§38): students, courses, professors, assessments —
 * boring, correct numbers, no BI (D34). `?assessment=<uuid>` selects the
 * score distribution chart for one assessment.
 */
export default async function AdminAnalyticsPage({ searchParams }: AdminAnalyticsPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const sp = await searchParams
  const selectedAssessmentId = z.guid().safeParse(firstParam(sp.assessment)).data ?? null

  let overview, courses, professors, assessments, distribution, settings
  try {
    ;[overview, courses, professors, assessments, distribution, settings] = await Promise.all([
      getOrgOverview(ctx.organizationId),
      getCourseStats(ctx.organizationId),
      getProfessorStats(ctx.organizationId),
      getAssessmentStats(ctx.organizationId),
      selectedAssessmentId ? getScoreDistribution(selectedAssessmentId) : Promise.resolve(null),
      getOrgSettings(ctx.organizationId),
    ])
  } catch {
    return (
      <div className="flex flex-col gap-8">
        <PageHeader title={analyticsMessages.admin.pageTitle} description={analyticsMessages.admin.pageDescription} />
        <ErrorState title={messages.errors.INTERNAL} />
      </div>
    )
  }

  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  return (
    <div className="flex flex-col gap-8">
      <PageHeader title={analyticsMessages.admin.pageTitle} description={analyticsMessages.admin.pageDescription} />
      {overview && (
        <>
          <AdminStudentsSection overview={overview} />
          <AdminCoursesSection overview={overview} courses={courses} timeZone={timeZone} />
          <AdminProfessorsSection overview={overview} professors={professors} timeZone={timeZone} />
        </>
      )}
      <AdminAssessmentsSection
        assessments={assessments}
        selectedAssessmentId={selectedAssessmentId}
        distribution={distribution}
      />
    </div>
  )
}
