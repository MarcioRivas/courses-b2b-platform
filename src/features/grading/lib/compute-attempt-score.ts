import type { AttemptQuestionForGrading } from "../types"

export interface ComputeAttemptScoreInput {
  questions: Pick<AttemptQuestionForGrading, "attemptQuestionId" | "type" | "points" | "pointsAwarded">[]
  /**
   * Points currently entered per OPEN_ENDED question (attemptQuestionId ->
   * points, null = not graded). A question absent from the map falls back to
   * its saved `pointsAwarded`.
   */
  manualPoints: Record<string, number | null | undefined>
}

export interface AttemptScore {
  autoScore: number
  manualScore: number
  totalScore: number
  maxScore: number
  percent: number | null
  ungradedCount: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

/**
 * Client mirror of the SQL scoring (`recompute_attempt_score`, D11): MC points
 * are auto-graded (saved `pointsAwarded`), OPEN_ENDED points come from the
 * editor, max is the sum of every question, percent = round(total*100/max, 2)
 * and null when max is 0. Keep in sync with the migration.
 */
export function computeAttemptScore({ questions, manualPoints }: ComputeAttemptScoreInput): AttemptScore {
  let autoScore = 0
  let manualScore = 0
  let maxScore = 0
  let ungradedCount = 0

  for (const q of questions) {
    maxScore += q.points
    if (q.type === "MULTIPLE_CHOICE") {
      autoScore += q.pointsAwarded ?? 0
      continue
    }
    const entered = q.attemptQuestionId in manualPoints ? manualPoints[q.attemptQuestionId] : q.pointsAwarded
    if (entered === null || entered === undefined) {
      ungradedCount += 1
    } else {
      manualScore += entered
    }
  }

  autoScore = round2(autoScore)
  manualScore = round2(manualScore)
  maxScore = round2(maxScore)
  const totalScore = round2(autoScore + manualScore)

  return {
    autoScore,
    manualScore,
    totalScore,
    maxScore,
    percent: maxScore === 0 ? null : round2((totalScore * 100) / maxScore),
    ungradedCount,
  }
}
