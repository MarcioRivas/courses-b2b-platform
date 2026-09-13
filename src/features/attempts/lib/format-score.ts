/** Pure display formatting for a score (D11) — no rounding rule beyond "nearest integer percent". */
export function formatScorePercent(percent: number | null): string {
  if (percent === null || Number.isNaN(percent)) {
    return "—"
  }
  return `${Math.round(percent)}%`
}

/** "78% · Bueno", or just the percent when no label resolved (`resolve_score_label` can return null). */
export function formatScoreSummary(percent: number | null, label: string | null): string {
  const pct = formatScorePercent(percent)
  if (percent === null) {
    return pct
  }
  return label ? `${pct} · ${label}` : pct
}
