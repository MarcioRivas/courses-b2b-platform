/**
 * Formats a percent value already rounded server-side (every analytics RPC
 * rounds to 1 decimal, D25/C14 — no client-side re-aggregation) for display.
 * Postgres `numeric` can arrive as a whole number (`60`) or a decimal
 * (`60.5`); this only controls the trailing `%`, it never re-rounds.
 */
export function formatPercent(value: number): string {
  return `${value}%`
}

/**
 * Orders `assessment_score_distribution` buckets for display: every
 * configured `score_scale_ranges` label first (server already orders these
 * by `min_score`), the "Sin rango" catch-all always last regardless of where
 * it appears in the input array.
 */
export function sortDistributionBuckets<T extends { label: string }>(buckets: T[]): T[] {
  const UNRATED_LABEL = "Sin rango"
  const rated = buckets.filter((bucket) => bucket.label !== UNRATED_LABEL)
  const unrated = buckets.filter((bucket) => bucket.label === UNRATED_LABEL)
  return [...rated, ...unrated]
}
