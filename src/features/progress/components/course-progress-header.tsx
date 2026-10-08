import { Breadcrumb } from "@/components/shared/breadcrumb"
import { formatDateInTimeZone } from "@/lib/dates/format-in-time-zone"
import { learnMessages } from "@/lib/messages/learn"
import { ProgressBar } from "@/features/enrollments/components/progress-bar"
import type { EnrollmentHeader } from "@/features/enrollments/queries/get-enrollment"

interface CourseProgressHeaderProps {
  enrollment: EnrollmentHeader
  timeZone: string
}

export function CourseProgressHeader({ enrollment, timeZone }: CourseProgressHeaderProps) {
  return (
    <header className="mb-6 flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
      <Breadcrumb
        items={[{ label: learnMessages.dashboard.title, href: "/learn" }, { label: enrollment.courseTitle }]}
      />

      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">{enrollment.courseTitle}</h1>
        <p className="text-sm text-muted-foreground">
          {enrollment.offeringName}
          {enrollment.endsAt
            ? ` · ${learnMessages.progress.endsAtPrefix} ${formatDateInTimeZone(enrollment.endsAt, timeZone)}`
            : ""}
        </p>
      </div>

      <ProgressBar
        percent={enrollment.progressPercent}
        completedBlocks={enrollment.completedBlocks}
        totalBlocks={enrollment.totalBlocks}
      />
    </header>
  )
}
