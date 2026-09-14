import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"
import { getAttemptResult } from "../queries/get-attempt-result"
import { formatScorePercent } from "../lib/format-score"
import type { AttemptSnapshot } from "../types"
import { QuestionCard } from "./question-card"

interface AttemptResultProps {
  snapshot: AttemptSnapshot
}

/**
 * Result view for a non-`IN_PROGRESS` attempt (5D step 17). Score, label and
 * overall feedback come from `attempt_result`, which returns them only once
 * the attempt is GRADED — so this page needs nothing but the attempt id.
 */
export async function AttemptResult({ snapshot }: AttemptResultProps) {
  const { header, questions } = snapshot
  const graded = header.status === "GRADED"
  const copy = learnAssessmentMessages.result

  const result = graded ? await getAttemptResult(header.attemptId) : null
  const scorePercent = result?.scorePercent ?? null
  const scoreLabel = result?.scoreLabel ?? null
  const passed = result?.passed ?? null
  const overallFeedback = result?.overallFeedback ?? null

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <CardTitle>{copy.title}</CardTitle>
            <Badge variant="outline">{copy.attemptNumberLabel(header.attemptNumber)}</Badge>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          {graded ? (
            <>
              <p
                className={cn(
                  "w-fit rounded-2xl px-5 py-3 font-heading text-3xl font-bold tabular-nums",
                  passed ? "bg-linear-to-br from-primary to-sky-700 text-white" : "bg-muted text-foreground"
                )}
              >
                {formatScorePercent(scorePercent)}
              </p>
              {scoreLabel && (
                <p className="text-sm text-muted-foreground">
                  {scoreLabel} — {passed ? copy.passed : copy.notPassed}
                </p>
              )}
              {overallFeedback && (
                <div className="mt-2 rounded-md bg-muted p-3 text-sm">
                  <p className="mb-1 font-medium">{copy.feedbackTitle}</p>
                  <p>{overallFeedback}</p>
                </div>
              )}
            </>
          ) : (
            <>
              <p className="text-sm font-medium">{copy.pendingGrading}</p>
              <p className="text-sm text-muted-foreground">{copy.pendingGradingDescription}</p>
            </>
          )}
        </CardContent>
      </Card>

      <ol className="flex flex-col gap-4">
        {questions.map((question) => (
          <li key={question.attemptQuestionId}>
            <QuestionCard
              question={question}
              value={{ selectedOptionId: question.selectedOptionId, textAnswer: question.textAnswer }}
              disabled
              showCorrectness={graded}
            />
          </li>
        ))}
      </ol>
    </div>
  )
}
