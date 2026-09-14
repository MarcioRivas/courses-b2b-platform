import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import type { AttemptForGrading, AttemptStatus } from "../types"

const STATUS_VARIANT: Record<AttemptStatus, "success" | "warning" | "outline"> = {
  IN_PROGRESS: "outline",
  SUBMITTED: "warning",
  AUTO_SUBMITTED: "warning",
  GRADED: "success",
}

interface ScoreSummaryProps {
  attempt: AttemptForGrading
}

/** Header of the grading panel: who/what, and the running score (D11). */
export function ScoreSummary({ attempt }: ScoreSummaryProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border bg-card p-5 shadow-card">
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
        <div
          className={cn(
            "rounded-xl px-3 py-2",
            attempt.passed === true ? "bg-linear-to-br from-primary to-sky-700 text-white" : "bg-muted"
          )}
        >
          <dt className={attempt.passed === true ? "text-white/90" : "text-muted-foreground"}>
            {teachGradingMessages.panel.percentLabel}
          </dt>
          <dd className="font-semibold">
            {attempt.scorePercent !== null ? `${attempt.scorePercent}% (${attempt.scoreLabel ?? "—"})` : "—"}
          </dd>
        </div>
      </dl>
    </div>
  )
}
