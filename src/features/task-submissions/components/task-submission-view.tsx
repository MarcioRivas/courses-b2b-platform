import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { cn } from "@/lib/utils"
import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import { formatScoreSummary } from "@/features/attempts/lib/format-score"
import { taskSubmissionPhase } from "../lib/task-submission-state"
import type { MyTaskSubmission, TaskSettings } from "../types"
import { TaskFileUploader } from "./task-file-uploader"
import { TaskSubmittedFiles } from "./task-submitted-files"

interface TaskSubmissionViewProps {
  settings: TaskSettings
  submission: MyTaskSubmission | null
  enrollmentId: string
  timeZone: string
  /** Enrollment closed or module locked: read-only regardless of dates. */
  blockedMessage: string | null
}

/**
 * Student screen for a TASK: the instruction (plain text, never HTML), the
 * deadline and file rules, the current entrega with its files, the grade once
 * corrected, and the uploader while submitting is still possible.
 */
export function TaskSubmissionView({ settings, submission, enrollmentId, timeZone, blockedMessage }: TaskSubmissionViewProps) {
  const copy = taskSubmissionMessages.student
  const status = taskSubmissionMessages.status
  const phase = taskSubmissionPhase(settings, submission)
  const deadline = formatDateTimeInTimeZone(settings.availableUntil, timeZone)
  const canSubmit = blockedMessage === null && (phase === "OPEN" || phase === "LATE_OPEN")
  const graded = submission?.status === "GRADED"

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{copy.instructionsTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <p className="text-sm whitespace-pre-wrap">{settings.instructions}</p>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{copy.deadlineLabel}</dt>
              <dd>{deadline}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{copy.yourSubmissionTitle}</dt>
              <dd>{copy.maxFilesLabel(settings.maxFiles)}</dd>
            </div>
          </dl>
          <p className="text-xs text-muted-foreground">
            {copy.filesHint} {settings.allowLateSubmissions && copy.lateAllowedNote}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{copy.yourSubmissionTitle}</CardTitle>
            <div className="flex gap-2">
              {submission?.submittedLate && <Badge variant="warning">{status.LATE}</Badge>}
              <Badge variant={graded ? "success" : submission ? "secondary" : "outline"}>
                {graded ? status.GRADED : submission ? status.SUBMITTED : phase === "CLOSED" ? status.CLOSED : status.PENDING}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          {submission ? (
            <>
              {submission.submittedAt && (
                <p className="text-sm text-muted-foreground">
                  {copy.submittedAt(formatDateTimeInTimeZone(submission.submittedAt, timeZone))}
                </p>
              )}
              <TaskSubmittedFiles files={submission.files} />
            </>
          ) : (
            <p className="text-sm text-muted-foreground">{copy.noSubmission}</p>
          )}

          {submission && !graded && <p className="text-sm">{copy.pendingGrading}</p>}

          {blockedMessage && <p className="text-sm text-muted-foreground">{blockedMessage}</p>}
          {!blockedMessage && phase === "NOT_OPEN" && settings.availableFrom && (
            <p className="text-sm text-muted-foreground">
              {copy.windowNotOpen(formatDateTimeInTimeZone(settings.availableFrom, timeZone))}
            </p>
          )}
          {!blockedMessage && phase === "CLOSED" && !graded && (
            <p className="text-sm text-muted-foreground">{copy.windowClosed}</p>
          )}
          {canSubmit && phase === "LATE_OPEN" && <p className="rounded-md bg-warning-soft p-3 text-sm text-yellow-900 dark:bg-yellow-950/40 dark:text-yellow-300">{copy.lateWarning}</p>}

          {canSubmit && (
            <TaskFileUploader
              assessmentId={settings.assessmentId}
              enrollmentId={enrollmentId}
              maxFiles={settings.maxFiles}
              isReplacement={submission !== null}
            />
          )}
        </CardContent>
      </Card>

      {graded && submission && (
        <Card>
          <CardHeader>
            <CardTitle>{copy.gradedTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-2">
            <p
              className={cn(
                "text-2xl font-semibold",
                submission.passed === true && "text-success",
                submission.passed === false && "text-destructive"
              )}
            >
              {formatScoreSummary(submission.scorePercent, submission.scoreLabel)}
            </p>
            {submission.passed !== null && (
              <p className="text-sm text-muted-foreground">
                {submission.passed ? learnAssessmentMessages.result.passed : learnAssessmentMessages.result.notPassed}
              </p>
            )}
            {submission.feedback && (
              <div className="mt-2 rounded-md bg-muted p-3 text-sm">
                <p className="mb-1 font-medium">{learnAssessmentMessages.result.feedbackTitle}</p>
                <p className="whitespace-pre-wrap">{submission.feedback}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
