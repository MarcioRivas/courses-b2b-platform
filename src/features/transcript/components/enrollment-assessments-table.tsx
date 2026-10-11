import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { formatScoreSummary } from "@/features/attempts/lib/format-score"
import { studentTranscriptMessages as t } from "@/lib/messages/student-transcript"
import type { TranscriptAssessment } from "../types"

function Result({ a }: { a: TranscriptAssessment }) {
  switch (a.lastStatus) {
    case null:
      return <span className="text-muted-foreground">{t.assessments.notSubmitted}</span>
    case "IN_PROGRESS":
      return <span className="text-muted-foreground">{t.assessments.inProgress}</span>
    case "SUBMITTED":
    case "AUTO_SUBMITTED":
      return <Badge variant="warning">{t.assessments.toGrade}</Badge>
    case "GRADED":
      return (
        <span className="flex flex-wrap items-center gap-2">
          <span className="tabular-nums">{formatScoreSummary(a.scorePercent, a.scoreLabel)}</span>
          <Badge variant={a.passed ? "success" : "destructive"}>
            {a.passed ? t.assessments.passed : t.assessments.notPassed}
          </Badge>
        </span>
      )
  }
}

/** Latest-attempt result per published assessment. `canGrade` links SUBMITTED attempts to the grading panel. */
export function EnrollmentAssessmentsTable({
  assessments,
  canGrade,
}: {
  assessments: TranscriptAssessment[]
  canGrade: boolean
}) {
  if (assessments.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.assessments.none}</p>
  }

  return (
    <ul className="divide-y rounded-xl border">
      {assessments.map((a) => {
        const gradable = canGrade && a.lastAttemptId && (a.lastStatus === "SUBMITTED" || a.lastStatus === "AUTO_SUBMITTED")
        return (
          <li key={a.assessmentId} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <p className="font-medium">{a.title}</p>
              <p className="text-xs text-muted-foreground">
                {t.assessments.kind[a.kind]} · {t.assessments.attemptsHeader} {a.attemptsUsed}/{a.maxAttempts ?? "∞"}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Result a={a} />
              {gradable && (
                <Link href={`/teach/grading/${a.lastAttemptId}`} className="text-primary underline-offset-4 hover:underline">
                  {t.assessments.gradeAction}
                </Link>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}
