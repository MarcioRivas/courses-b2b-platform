/** 75 → "1:15", 3605 → "1:00:05". */
export function formatTimestamp(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds))
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  const ss = String(s).padStart(2, "0")
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`
}

/** "1:15" → 75, "1:00:05" → 3605, "90" → 90; null when the text is not a valid time. */
export function parseTimestamp(text: string): number | null {
  const trimmed = text.trim()
  if (!/^\d+(:\d{1,2}){0,2}$/.test(trimmed)) {
    return null
  }

  const parts = trimmed.split(":").map(Number)
  if (parts.slice(1).some((part) => part > 59)) {
    return null
  }

  return parts.reduce((total, part) => total * 60 + part, 0)
}
