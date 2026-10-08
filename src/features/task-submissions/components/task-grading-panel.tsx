import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { formatScoreSummary } from "@/features/attempts/lib/format-score"
import type { TaskSubmissionForGrading } from "../queries/get-task-submission-for-grading"
import { TaskGradeForm } from "./task-grade-form"
import { TaskSubmittedFiles } from "./task-submitted-files"

interface TaskGradingPanelProps {
  submission: TaskSubmissionForGrading
  timeZone: string
}

/**
 * Grader view of a TASK submission: the instruction, the submitted files
 * (open/download) and the score + feedback form. The form only appears once
 * the deadline has passed — `grade_task_submission` refuses earlier.
 */
export function TaskGradingPanel({ submission, timeZone }: TaskGradingPanelProps) {
  const copy = taskSubmissionMessages.grading
  const deadlinePassed = submission.availableUntil !== null && new Date() >= new Date(submission.availableUntil)
  const graded = submission.status === "GRADED"

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>
              {submission.studentName} · {submission.assessmentTitle}
            </CardTitle>
            <div className="flex gap-2">
              {submission.submittedLate && <Badge variant="warning">{taskSubmissionMessages.status.LATE}</Badge>}
              <Badge variant={graded ? "success" : "outline"}>{teachGradingMessages.status[submission.status]}</Badge>
            </div>
          </div>
          <p className="text-sm text-muted-foreground">
            {submission.courseTitle}
            {submission.submittedAt && ` · ${formatDateTimeInTimeZone(submission.submittedAt, timeZone)}`}
          </p>
        </CardHeader>
        <CardContent>
          <details className="rounded-md bg-muted p-3 text-sm">
            <summary className="cursor-pointer font-medium">{copy.instructionsTitle}</summary>
            <p className="mt-2 whitespace-pre-wrap">{submission.instructions}</p>
          </details>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{copy.filesTitle}</CardTitle>
        </CardHeader>
        <CardContent>
          {submission.files.length > 0 ? (
            <TaskSubmittedFiles files={submission.files} allowOpen />
          ) : (
            <p className="text-sm text-muted-foreground">{copy.noFiles}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{teachGradingMessages.panel.title}</CardTitle>
            {graded && submission.scorePercent !== null && (
              <Badge variant="success">{formatScoreSummary(submission.scorePercent, submission.scoreLabel)}</Badge>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {deadlinePassed ? (
            <TaskGradeForm
              attemptId={submission.attemptId}
              submittedAt={submission.submittedAt}
              initialScore={submission.scorePercent}
              initialFeedback={submission.feedback}
            />
          ) : (
            <p className="text-sm text-muted-foreground">
              {copy.deadlineNotPassed(
                submission.availableUntil ? formatDateTimeInTimeZone(submission.availableUntil, timeZone) : "—"
              )}
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
