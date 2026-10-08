import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { getAttemptForGrading } from "@/features/grading/queries/get-attempt-for-grading"
import { GradingPanel } from "@/features/grading/components/grading-panel"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
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
  const [taskSubmission, settings] =
    attempt.assessmentKind === "TASK"
      ? await Promise.all([getTaskSubmissionForGrading(attemptId), getOrgSettings(ctx.organizationId)])
      : [null, null]

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
      />
      {taskSubmission ? (
        <TaskGradingPanel submission={taskSubmission} timeZone={settings?.timezone ?? DEFAULT_TIME_ZONE} />
      ) : (
        <GradingPanel attempt={attempt} />
      )}
    </div>
  )
}
