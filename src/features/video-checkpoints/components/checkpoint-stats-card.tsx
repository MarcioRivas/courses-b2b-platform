import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"
import { formatTimestamp } from "../lib/format-timestamp"
import type { CheckpointStats } from "../types"

const percent = (part: number, whole: number) => (whole === 0 ? "—" : `${Math.round((part / whole) * 100)}%`)

interface CheckpointStatsCardProps {
  checkpoint: CheckpointStats
  enrolledCount: number
  hardest: boolean
}

/**
 * One checkpoint's results: reach, pass rates, attempts, and per question the
 * wrong-answer rate with an option breakdown (the most-chosen wrong option is
 * usually what was misunderstood in the video).
 */
export function CheckpointStatsCard({ checkpoint, enrolledCount, hardest }: CheckpointStatsCardProps) {
  const copy = videoCheckpointMessages.stats

  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-semibold tabular-nums">{formatTimestamp(checkpoint.atSeconds)}</span>
        {hardest && <Badge variant="warning">{copy.hardest}</Badge>}
      </div>

      {checkpoint.reached === 0 ? (
        <p className="text-sm text-muted-foreground">{copy.noData}</p>
      ) : (
        <>
          <ul className="flex flex-col gap-1 text-sm">
            <li>{copy.reached(checkpoint.reached, enrolledCount)}</li>
            <li>
              {copy.passRate(
                percent(checkpoint.passed, checkpoint.reached),
                percent(checkpoint.firstTryPassed, checkpoint.firstTryAttempts)
              )}
            </li>
            {checkpoint.avgAttemptsToPass !== null && (
              <li>{copy.avgAttempts(checkpoint.avgAttemptsToPass.toLocaleString("es-UY"))}</li>
            )}
          </ul>

          <ul className="flex flex-col gap-3">
            {checkpoint.questions.map((question) => {
              const wrongShare = question.answers === 0 ? 0 : question.wrong / question.answers
              const mostChosenWrong = question.options
                .filter((option) => !option.isCorrect && option.chosen > 0)
                .sort((a, b) => b.chosen - a.chosen)[0]

              return (
                <li key={question.id} className="flex flex-col gap-1.5 rounded-md bg-muted/50 p-3">
                  <p className="text-sm font-medium">{question.prompt}</p>
                  <div className="flex items-center gap-2">
                    <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted" aria-hidden>
                      <div className="h-full bg-destructive/70" style={{ width: `${Math.round(wrongShare * 100)}%` }} />
                    </div>
                    <span className="text-xs tabular-nums">{copy.wrongRate(percent(question.wrong, question.answers))}</span>
                  </div>
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">{copy.answersSummary(question.answers)}</summary>
                    <ul className="mt-1 flex flex-col gap-0.5">
                      {question.options.map((option) => (
                        <li
                          key={option.id}
                          className={cn(
                            "flex justify-between gap-2",
                            option.isCorrect && "font-medium text-success",
                            option.id === mostChosenWrong?.id && "font-medium text-destructive"
                          )}
                        >
                          <span>{option.label}</span>
                          <span className="tabular-nums">{copy.chosen(option.chosen)}</span>
                        </li>
                      ))}
                    </ul>
                  </details>
                </li>
              )
            })}
          </ul>
        </>
      )}
    </li>
  )
}
