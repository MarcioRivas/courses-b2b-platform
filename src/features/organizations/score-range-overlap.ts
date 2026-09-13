export interface ScoreRangeBounds {
  id?: string
  minScore: number
  maxScore: number
}

function rangesOverlap(a: ScoreRangeBounds, b: ScoreRangeBounds): boolean {
  return a.minScore <= b.maxScore && b.minScore <= a.maxScore
}

/**
 * Client-side pre-check mirroring the DB exclusion constraint (23P01) on
 * `score_scale_ranges`. Never a substitute for the server check — just fails
 * fast before a round trip. Ignores the range being edited (same `id`).
 */
export function hasOverlappingRange(
  existing: ScoreRangeBounds[],
  candidate: ScoreRangeBounds
): boolean {
  return existing.some(
    (range) => (!candidate.id || range.id !== candidate.id) && rangesOverlap(range, candidate)
  )
}
