import { z } from "zod"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { listProfessorCourses } from "@/features/courses/queries/list-professor-courses"
import { listPendingAttempts } from "@/features/grading/queries/list-pending-attempts"
import { listGradableAssessments } from "@/features/grading/queries/list-gradable-assessments"
import { GradingFilters } from "@/features/grading/components/grading-filters"
import { GradingQueue } from "@/features/grading/components/grading-queue"
import { firstParam, type SearchParams } from "@/lib/search-params"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import type { GradingStatusGroup } from "@/features/grading/types"

interface TeachGradingPageProps {
  searchParams: Promise<SearchParams>
}

/**
 * Professor grading queue (D15/B12): SUBMITTED/AUTO_SUBMITTED attempts of
 * courses the professor can grade, oldest first, plus a "Corregidas" tab to
 * revisit and edit points. Admins would need an `/admin` mirror — this layout
 * still gates on PROFESSOR only (unchanged, see report).
 */
export default async function TeachGradingPage({ searchParams }: TeachGradingPageProps) {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const sp = await searchParams
  const page = Math.max(1, Number(firstParam(sp.page)) || 1)
  const statusGroup: GradingStatusGroup = firstParam(sp.status) === "GRADED" ? "GRADED" : "PENDING"
  // Low fix (review 260913, cycle 2): PostgREST already fails closed on a
  // malformed uuid filter, but validating here avoids a wasted round trip and
  // silently ignores a garbage value instead of surfacing a raw PG error.
  const courseId = z.guid().safeParse(firstParam(sp.courseId)).data
  const assessmentId = z.guid().safeParse(firstParam(sp.assessmentId)).data

  const [courses, settings, { items, total }] = await Promise.all([
    listProfessorCourses(ctx.user.id),
    getOrgSettings(ctx.organizationId),
    listPendingAttempts({ statusGroup, courseId, assessmentId, page }),
  ])
  const assessments = await listGradableAssessments(courses.map((course) => course.id))
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={teachGradingMessages.queue.title} description={teachGradingMessages.queue.description} />
      <GradingFilters courses={courses} assessments={assessments} />
      <GradingQueue
        items={items}
        total={total}
        page={page}
        statusGroup={statusGroup}
        timeZone={timeZone}
        searchParams={sp}
      />
    </div>
  )
}
