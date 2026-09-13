import { Badge } from "@/components/ui/badge"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import type { AttemptForGrading, AttemptStatus } from "../types"

const STATUS_VARIANT: Record<AttemptStatus, "default" | "secondary" | "outline"> = {
  IN_PROGRESS: "outline",
  SUBMITTED: "secondary",
  AUTO_SUBMITTED: "secondary",
  GRADED: "default",
}

interface ScoreSummaryProps {
  attempt: AttemptForGrading
}

/** Header of the grading panel: who/what, and the running score (D11). */
export function ScoreSummary({ attempt }: ScoreSummaryProps) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium">{attempt.studentName}</p>
          <p className="text-sm text-muted-foreground">
            {attempt.courseTitle} · {attempt.assessmentTitle}
          </p>
        </div>
        <Badge variant={STATUS_VARIANT[attempt.status]}>{teachGradingMessages.status[attempt.status]}</Badge>
      </div>
      <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div>
          <dt className="text-muted-foreground">{teachGradingMessages.panel.autoScoreLabel}</dt>
          <dd className="font-medium">{attempt.autoScore}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{teachGradingMessages.panel.manualScoreLabel}</dt>
          <dd className="font-medium">{attempt.manualScore}</dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{teachGradingMessages.panel.totalScoreLabel}</dt>
          <dd className="font-medium">
            {attempt.totalScore} / {attempt.maxScore}
          </dd>
        </div>
        <div>
          <dt className="text-muted-foreground">{teachGradingMessages.panel.percentLabel}</dt>
          <dd className="font-medium">
            {attempt.scorePercent !== null ? `${attempt.scorePercent}% (${attempt.scoreLabel ?? "—"})` : "—"}
          </dd>
        </div>
      </dl>
    </div>
  )
}
