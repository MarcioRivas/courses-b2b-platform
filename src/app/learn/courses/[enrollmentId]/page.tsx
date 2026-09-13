import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { EmptyState } from "@/components/shared/empty-state"
import { ErrorState } from "@/components/shared/error-state"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { learnMessages } from "@/lib/messages/learn"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { getEnrollment } from "@/features/enrollments/queries/get-enrollment"
import { getEnrollmentCourseTree } from "@/features/enrollments/queries/get-enrollment-course-tree"
import { getUnlockState } from "@/features/progress/queries/get-unlock-state"
import { getModuleSummary } from "@/features/progress/queries/get-module-summary"
import { CourseProgressHeader } from "@/features/progress/components/course-progress-header"
import { ModuleList } from "@/features/progress/components/module-list"
import { CourseAssessmentsSection } from "@/features/attempts/components/course-assessments-section"

interface PageProps {
  params: Promise<{ enrollmentId: string }>
}

export default async function StudentCoursePage({ params }: PageProps) {
  const ctx = await requireOrgRole(["STUDENT"])
  const { enrollmentId } = await params

  // RLS decides this, not a hand-written ownership check: a foreign or revoked
  // enrollment simply does not come back.
  const enrollment = await getEnrollment(enrollmentId)

  if (!enrollment) {
    notFound()
  }

  const [modules, unlockStates, summaries, settings] = await Promise.all([
    getEnrollmentCourseTree(enrollment.courseId, enrollment.id),
    getUnlockState(enrollment.id),
    getModuleSummary(enrollment.id),
    getOrgSettings(ctx.organizationId),
  ])

  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  // The reason is authored by `module_unlock_state`, never re-derived here.
  // Only an ARCHIVED course / CANCELLED offering takes this path: an offering
  // that merely ran past `ends_at` still lists its modules, each with its own
  // "Vencido" chip, which is more useful than one banner.
  const closedReason = unlockStates[0]?.reason ?? learnMessages.errors.courseUnavailable

  return (
    <>
      <CourseProgressHeader enrollment={enrollment} timeZone={timeZone} />

      <h2 className="mb-3 text-base font-semibold tracking-tight">
        {learnMessages.course.modulesTitle}
      </h2>

      {enrollment.closed ? (
        // `modules` comes back empty here — RLS hides an unpublished course's
        // content — so the server's own explanation is shown instead of an
        // empty list or the bare 404 this used to render (§53).
        <ErrorState title={learnMessages.errors.courseUnavailable} description={closedReason} />
      ) : modules.length === 0 ? (
        <EmptyState title={learnMessages.course.emptyModules} />
      ) : (
        <ModuleList
          enrollmentId={enrollment.id}
          modules={modules}
          unlockStates={new Map(unlockStates.map((state) => [state.moduleId, state]))}
          summaries={summaries}
          timeZone={timeZone}
        />
      )}

      {!enrollment.closed && (
        <div className="mt-8">
          <CourseAssessmentsSection enrollmentId={enrollment.id} timeZone={timeZone} />
        </div>
      )}
    </>
  )
}
