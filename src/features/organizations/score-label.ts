export interface ScoreRangeForLabel {
  minScore: number
  maxScore: number
  label: string
  isPassing: boolean
}

/**
 * Preview-only resolution of a score label from a percent (D11/D34). The
 * label a student actually sees is always resolved server-side at grading
 * time and denormalized onto the attempt row — this pure helper only powers
 * the admin score-scale preview strip so it can't drift from that contract.
 */
export function resolveScoreLabel(
  ranges: ScoreRangeForLabel[],
  percent: number
): ScoreRangeForLabel | null {
  return ranges.find((range) => percent >= range.minScore && percent <= range.maxScore) ?? null
}
