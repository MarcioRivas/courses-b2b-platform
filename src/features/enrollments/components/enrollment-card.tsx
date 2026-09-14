import Link from "next/link"
import { formatDateInTimeZone } from "@/lib/dates/format-in-time-zone"
import { learnMessages } from "@/lib/messages/learn"
import type { StudentEnrollment } from "../types"
import { ProgressBar } from "./progress-bar"

interface EnrollmentCardProps {
  enrollment: StudentEnrollment
  timeZone: string
}

/**
 * No "next module" lookup here (D34): that answer needs `module_unlock_state`,
 * one call per enrollment, which would turn the dashboard into N+1 round trips.
 * It lives on the course detail page, which calls the function anyway.
 */
export function EnrollmentCard({ enrollment, timeZone }: EnrollmentCardProps) {
  const finished = enrollment.status === "COMPLETED"

  return (
    <Link
      href={`/learn/courses/${enrollment.id}`}
      className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card transition hover:-translate-y-0.5 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
    >
      <div className="flex flex-col gap-0.5">
        <h3 className="font-heading font-semibold leading-tight">{enrollment.courseTitle}</h3>
        <p className="truncate text-xs text-muted-foreground">{enrollment.offeringName}</p>
      </div>

      <ProgressBar
        percent={enrollment.progressPercent}
        completedBlocks={enrollment.completedBlocks}
        totalBlocks={enrollment.totalBlocks}
      />

      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="text-muted-foreground">
          {enrollment.endsAt
            ? `${learnMessages.progress.endsAtPrefix} ${formatDateInTimeZone(enrollment.endsAt, timeZone)}`
            : learnMessages.progress.noEndDate}
        </span>
        <span className="font-medium text-primary">
          {enrollment.closed
            ? learnMessages.states.EXPIRED
            : finished
              ? learnMessages.dashboard.reviewAction
              : learnMessages.dashboard.continueAction}
        </span>
      </div>
    </Link>
  )
}
