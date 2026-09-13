import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { EmptyState } from "@/components/shared/empty-state"
import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import { listMyAttempts } from "../queries/list-my-attempts"
import { formatScoreSummary } from "../lib/format-score"
import type { MyAttemptRow } from "../types"

interface CourseAssessmentsSectionProps {
  enrollmentId: string
  timeZone: string
}

type WindowState = "upcoming" | "open" | "closed"

function windowState(row: MyAttemptRow, now: Date): WindowState {
  if (row.availableFrom && now < new Date(row.availableFrom)) {
    return "upcoming"
  }
  if (row.availableUntil && now > new Date(row.availableUntil)) {
    return "closed"
  }
  return "open"
}

function isFinished(status: MyAttemptRow["lastStatus"]): boolean {
  return status === "SUBMITTED" || status === "AUTO_SUBMITTED" || status === "GRADED"
}

/**
 * "Evaluaciones" section (F13): EXAM assessments are otherwise invisible to a
 * student unless a lesson happens to link one, so this is their only
 * guaranteed entry point plus their history for the course.
 */
export async function CourseAssessmentsSection({ enrollmentId, timeZone }: CourseAssessmentsSectionProps) {
  const rows = await listMyAttempts(enrollmentId)
  const exams = rows.filter((row) => row.kind === "EXAM")
  const copy = learnAssessmentMessages.courseSection

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold tracking-tight">{copy.title}</h2>

      {exams.length === 0 ? (
        <EmptyState title={copy.empty} />
      ) : (
        <ul className="flex flex-col gap-3">
          {exams.map((row) => {
            const now = new Date()
            const state = windowState(row, now)
            const finished = isFinished(row.lastStatus)
            const canAttemptMore = row.maxAttempts === null || row.attemptsUsed < row.maxAttempts

            return (
              <li key={row.assessmentId} className="flex flex-col gap-2 rounded-lg border bg-card p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-medium">{row.title}</h3>
                  <Badge variant={state === "open" ? "default" : state === "upcoming" ? "outline" : "secondary"}>
                    {state === "upcoming" ? copy.stateUpcoming : state === "open" ? copy.stateOpen : copy.stateClosed}
                  </Badge>
                </div>

                <p className="text-xs text-muted-foreground">
                  {row.availableFrom &&
                    `${learnAssessmentMessages.preflight.windowFromPrefix} ${formatDateTimeInTimeZone(row.availableFrom, timeZone)} `}
                  {row.availableUntil &&
                    `${learnAssessmentMessages.preflight.windowUntilPrefix} ${formatDateTimeInTimeZone(row.availableUntil, timeZone)}`}
                </p>

                <p className="text-xs text-muted-foreground">{copy.attemptsLabel(row.attemptsUsed, row.maxAttempts)}</p>

                {row.lastStatus === "GRADED" && (
                  <p className="text-sm font-medium">{formatScoreSummary(row.scorePercent, row.scoreLabel)}</p>
                )}

                {row.overallFeedback && (
                  <p className="rounded-md bg-muted p-2 text-sm text-muted-foreground">{row.overallFeedback}</p>
                )}

                <div className="flex flex-wrap gap-2">
                  {finished && (
                    <Button size="sm" variant="outline" render={<Link href={`/learn/attempts/${row.lastAttemptId}?enrollment=${enrollmentId}`} />}>
                      {copy.reviewAction}
                    </Button>
                  )}
                  {/* M4: a finished attempt with attempts remaining still needs a way to start again, alongside reviewing the last result. */}
                  {state === "open" && canAttemptMore && (
                    <Button
                      size="sm"
                      render={<Link href={`/learn/assessments/${row.assessmentId}/start?enrollment=${enrollmentId}`} />}
                    >
                      {row.lastStatus === "IN_PROGRESS"
                        ? copy.continueAction
                        : finished
                          ? copy.newAttemptAction
                          : copy.startAction}
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}
    </section>
  )
}
