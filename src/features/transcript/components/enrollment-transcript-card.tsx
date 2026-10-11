import { ChevronDownIcon } from "lucide-react"
import { ProgressBar } from "@/features/enrollments/components/progress-bar"
import { formatDateInTimeZone } from "@/lib/dates/format-in-time-zone"
import { studentTranscriptMessages as t } from "@/lib/messages/student-transcript"
import { CourseOutcomeBadge } from "./course-outcome-badge"
import { EnrollmentAssessmentsTable } from "./enrollment-assessments-table"
import { EnrollmentActivityTimeline } from "./enrollment-activity-timeline"
import { EnrollmentPendingList } from "./enrollment-pending-list"
import type { CourseOutcome, EnrollmentTranscriptDetail, StudentEnrollment } from "../types"

interface EnrollmentTranscriptCardProps {
  enrollment: StudentEnrollment
  /** null when the detail RPC failed: the card shows an error instead of an outcome. */
  detail: EnrollmentTranscriptDetail | null
  outcome: CourseOutcome | null
  timeZone: string
  canGrade: boolean
}

/**
 * Collapsible (native <details>, no client JS) course card. Historial and
 * Pendiente are rendered only for IN_PROGRESS editions; in-progress cards start open.
 */
export function EnrollmentTranscriptCard({ enrollment, detail, outcome, timeZone, canGrade }: EnrollmentTranscriptCardProps) {
  const inProgress = outcome === "IN_PROGRESS"

  return (
    <details open={inProgress} className="group rounded-2xl border bg-card shadow-card">
      <summary className="flex cursor-pointer list-none flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-medium">
            {enrollment.courseTitle} · {enrollment.offeringLabel}
          </p>
          <p className="text-xs text-muted-foreground">
            {t.card.enrolledOn} {formatDateInTimeZone(enrollment.enrolledAt, timeZone)}
            {enrollment.endsAt && ` · ${t.card.dueOn} ${formatDateInTimeZone(enrollment.endsAt, timeZone)}`}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="w-32">
            <ProgressBar
              percent={enrollment.progressPercent}
              completedBlocks={enrollment.completedBlocks}
              totalBlocks={enrollment.totalBlocks}
              compact
            />
          </div>
          {outcome && <CourseOutcomeBadge outcome={outcome} />}
          <ChevronDownIcon aria-hidden="true" className="size-4 transition-transform group-open:rotate-180" />
        </div>
      </summary>

      <div className="flex flex-col gap-4 border-t p-4">
        {!detail ? (
          <p role="alert" className="text-sm text-destructive">
            {t.card.loadError}
          </p>
        ) : (
          <>
        <section className="flex flex-col gap-2">
          <h4 className="text-sm font-semibold">{t.assessments.title}</h4>
          <EnrollmentAssessmentsTable assessments={detail.assessments} canGrade={canGrade} />
        </section>
        {inProgress && (
          <div className="grid gap-6 md:grid-cols-2">
            <EnrollmentActivityTimeline activity={detail.activity} timeZone={timeZone} />
            <EnrollmentPendingList pending={detail.pending} />
          </div>
        )}
          </>
        )}
      </div>
    </details>
  )
}
