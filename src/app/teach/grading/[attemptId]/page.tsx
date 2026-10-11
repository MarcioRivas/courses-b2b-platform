import Link from "next/link"
import { notFound } from "next/navigation"
import { Button } from "@/components/ui/button"
import { studentTranscriptMessages } from "@/lib/messages/student-transcript"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { getAttemptForGrading } from "@/features/grading/queries/get-attempt-for-grading"
import { GradingPanel } from "@/features/grading/components/grading-panel"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { listScoreRanges } from "@/features/organizations/queries/list-score-ranges"
import { getTaskSubmissionForGrading } from "@/features/task-submissions/queries/get-task-submission-for-grading"
import { TaskGradingPanel } from "@/features/task-submissions/components/task-grading-panel"

interface TeachGradingAttemptPageProps {
  params: Promise<{ attemptId: string }>
}

/** Per-attempt grading screen (D15) — RLS scopes visibility, `notFound()` otherwise. */
export default async function TeachGradingAttemptPage({ params }: TeachGradingAttemptPageProps) {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const { attemptId } = await params

  const attempt = await getAttemptForGrading(attemptId)
  if (!attempt) {
    return notFound()
  }

  // A TASK is graded as a whole (files + one 0..100 score), not per question.
  const [taskSubmission, settings, scoreRanges] = await Promise.all([
    attempt.assessmentKind === "TASK" ? getTaskSubmissionForGrading(attemptId) : null,
    attempt.assessmentKind === "TASK" ? getOrgSettings(ctx.organizationId) : null,
    listScoreRanges(ctx.organizationId),
  ])

  if (attempt.assessmentKind === "TASK" && !taskSubmission) {
    return notFound()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={teachGradingMessages.panel.title}
        breadcrumb={[
          { label: teachGradingMessages.queue.title, href: "/teach/grading" },
          { label: `${attempt.studentName} · ${attempt.assessmentTitle}` },
        ]}
      >
        <Button
          variant="outline"
          size="sm"
          render={<Link href={`/teach/students/${attempt.studentUserId}`} />}
        >
          {studentTranscriptMessages.students.viewAction}
        </Button>
      </PageHeader>
      {taskSubmission ? (
        <TaskGradingPanel
          submission={taskSubmission}
          timeZone={settings?.timezone ?? DEFAULT_TIME_ZONE}
          scoreRanges={scoreRanges}
        />
      ) : (
        <GradingPanel attempt={attempt} scoreRanges={scoreRanges} />
      )}
    </div>
  )
}
