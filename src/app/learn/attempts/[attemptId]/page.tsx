import { notFound, redirect } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { getAttempt } from "@/features/attempts/queries/get-attempt"
import { AttemptPlayer } from "@/features/attempts/components/attempt-player"
import { AttemptResult } from "@/features/attempts/components/attempt-result"
import { Breadcrumb } from "@/components/shared/breadcrumb"
import { learnMessages } from "@/lib/messages/learn"
import { getEnrollment } from "@/features/enrollments/queries/get-enrollment"
import { getAssessmentPreflight } from "@/features/attempts/queries/get-assessment-preflight"

interface PageProps {
  params: Promise<{ attemptId: string }>
}

/**
 * RSC shell (5D step 12): loads `attempt_header` + `student_attempt_view`
 * server-side and either mounts the interactive player (`IN_PROGRESS`) or the
 * read-only result view (score resolved by `attempt_result`, no enrollment
 * id needed).
 */
export default async function AttemptPage({ params }: PageProps) {
  await requireOrgRole(["STUDENT"])
  const { attemptId } = await params

  const snapshot = await getAttempt(attemptId)
  if (!snapshot) {
    notFound()
  }

  // TASK submissions have no question snapshot; their screen is the task page.
  const [assessment, enrollment] = await Promise.all([
    getAssessmentPreflight(snapshot.header.assessmentId),
    getEnrollment(snapshot.header.enrollmentId),
  ])
  if (assessment?.kind === "TASK") {
    redirect(`/learn/assessments/${snapshot.header.assessmentId}/start?enrollment=${snapshot.header.enrollmentId}`)
  }

  const breadcrumb = (
    <div className="mb-4">
      <Breadcrumb
        items={[
          { label: learnMessages.nav.courses, href: "/learn" },
          ...(enrollment
            ? [{ label: enrollment.courseTitle, href: `/learn/courses/${enrollment.id}` }]
            : []),
          ...(assessment ? [{ label: assessment.title }] : []),
        ]}
      />
    </div>
  )

  return (
    <>
      {breadcrumb}
      {snapshot.header.status !== "IN_PROGRESS" ? (
        <AttemptResult snapshot={snapshot} />
      ) : (
        <AttemptPlayer attemptId={attemptId} initialSnapshot={snapshot} />
      )}
    </>
  )
}
