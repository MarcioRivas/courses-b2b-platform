import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import { listMyAttempts } from "../queries/list-my-attempts"
import { formatScoreSummary } from "../lib/format-score"
import type { MyAttemptRow } from "../types"

interface ActiveEnrollment {
  id: string
  courseTitle: string
}

interface PendingResultsStripProps {
  activeEnrollments: ActiveEnrollment[]
}

interface EnrollmentAttemptRow {
  enrollmentId: string
  courseTitle: string
  row: MyAttemptRow
}

function isOpenNow(row: MyAttemptRow, now: Date): boolean {
  if (row.availableFrom && now < new Date(row.availableFrom)) {
    return false
  }
  if (row.availableUntil && now > new Date(row.availableUntil)) {
    return false
  }
  return true
}

function isFinished(status: MyAttemptRow["lastStatus"]): boolean {
  return status === "SUBMITTED" || status === "AUTO_SUBMITTED" || status === "GRADED"
}

/**
 * "Pendientes / Resultados" strip on `/learn` (F13): the only place a student
 * sees, across every course at once, which EXAMs are open and waiting and
 * which ones just came back GRADED. Hidden entirely when both lists are empty.
 */
export async function PendingResultsStrip({ activeEnrollments }: PendingResultsStripProps) {
  if (activeEnrollments.length === 0) {
    return null
  }

  const perEnrollment = await Promise.all(
    activeEnrollments.map(async (enrollment) => ({
      enrollment,
      rows: await listMyAttempts(enrollment.id),
    }))
  )

  const now = new Date()
  const pending: EnrollmentAttemptRow[] = []
  const results: EnrollmentAttemptRow[] = []

  for (const { enrollment, rows } of perEnrollment) {
    for (const row of rows) {
      if (row.kind !== "EXAM") {
        continue
      }
      if (row.lastStatus === "GRADED") {
        results.push({ enrollmentId: enrollment.id, courseTitle: enrollment.courseTitle, row })
      } else if (isOpenNow(row, now) && !isFinished(row.lastStatus)) {
        pending.push({ enrollmentId: enrollment.id, courseTitle: enrollment.courseTitle, row })
      }
    }
  }

  if (pending.length === 0 && results.length === 0) {
    return null
  }

  const copy = learnAssessmentMessages.pendingStrip

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-base font-semibold tracking-tight">{copy.title}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        {pending.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{copy.pendingLabel}</h3>
            <ul className="flex flex-col gap-2">
              {pending.map(({ enrollmentId, courseTitle, row }) => (
                <li key={`${enrollmentId}-${row.assessmentId}`} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
                  <div>
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{courseTitle}</p>
                  </div>
                  <Button
                    size="sm"
                    render={<Link href={`/learn/assessments/${row.assessmentId}/start?enrollment=${enrollmentId}`} />}
                  >
                    {copy.goToAssessment}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {results.length > 0 && (
          <div className="flex flex-col gap-2">
            <h3 className="text-sm font-medium text-muted-foreground">{copy.resultsLabel}</h3>
            <ul className="flex flex-col gap-2">
              {results.map(({ enrollmentId, courseTitle, row }) => (
                <li key={`${enrollmentId}-${row.assessmentId}`} className="flex items-center justify-between gap-2 rounded-lg border bg-card p-3">
                  <div>
                    <p className="text-sm font-medium">{row.title}</p>
                    <p className="text-xs text-muted-foreground">{courseTitle}</p>
                    <Badge variant="outline" className="mt-1">
                      {formatScoreSummary(row.scorePercent, row.scoreLabel)}
                    </Badge>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    render={<Link href={`/learn/attempts/${row.lastAttemptId}?enrollment=${enrollmentId}`} />}
                  >
                    {copy.seeResult}
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </section>
  )
}
