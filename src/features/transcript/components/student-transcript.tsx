import { EmptyState } from "@/components/shared/empty-state"
import { studentTranscriptMessages as t } from "@/lib/messages/student-transcript"
import { listStudentEnrollments } from "../queries/list-student-enrollments"
import { getEnrollmentTranscriptDetail } from "../queries/get-enrollment-transcript-detail"
import { resolveCourseOutcome } from "../lib/resolve-course-outcome"
import { EnrollmentTranscriptCard } from "./enrollment-transcript-card"
import { TranscriptSummaryStats } from "./transcript-summary-stats"

interface StudentTranscriptProps {
  userId: string
  area: "admin" | "teach"
  timeZone: string
}

/**
 * Escolaridad of one student. Outcome needs per-assessment data, so the detail
 * of every enrollment is fetched up front in ONE Promise.all (no waterfall; the
 * enrollment count per student is small). Cards then need no client JS.
 * Visibility is enforced by the RPCs (admin: org, professor: own editions).
 */
export async function StudentTranscript({ userId, area, timeZone }: StudentTranscriptProps) {
  const enrollments = await listStudentEnrollments(userId)
  if (enrollments.length === 0) {
    return <EmptyState title={t.empty} />
  }

  const rows = (
    await Promise.all(
      enrollments.map(async (enrollment) => {
        const detail = await getEnrollmentTranscriptDetail(enrollment.enrollmentId)
        // A failed detail load must not masquerade as an outcome (e.g. COMPLETED → Aprobado).
        const outcome = detail
          ? resolveCourseOutcome({
              enrollmentStatus: enrollment.status,
              endsAt: enrollment.endsAt,
              assessments: detail.assessments,
            })
          : null
        return { enrollment, detail, outcome }
      })
    )
  ).sort((a, b) => {
    const progress = Number(b.outcome === "IN_PROGRESS") - Number(a.outcome === "IN_PROGRESS")
    return progress || b.enrollment.enrolledAt.localeCompare(a.enrollment.enrolledAt)
  })

  return (
    <div className="flex flex-col gap-4">
      <TranscriptSummaryStats outcomes={rows.map((r) => r.outcome)} />
      {rows.map((r) => (
        <EnrollmentTranscriptCard
          key={r.enrollment.enrollmentId}
          enrollment={r.enrollment}
          detail={r.detail}
          outcome={r.outcome}
          timeZone={timeZone}
          canGrade={area === "teach"}
        />
      ))}
    </div>
  )
}
