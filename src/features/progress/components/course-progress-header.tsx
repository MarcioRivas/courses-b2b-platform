import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
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
    <header className="mb-6 flex flex-col gap-3">
      <Link
        href="/learn"
        className="flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" aria-hidden />
        {learnMessages.course.backToCourses}
      </Link>

      <div>
        <h1 className="text-xl font-semibold tracking-tight">{enrollment.courseTitle}</h1>
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
