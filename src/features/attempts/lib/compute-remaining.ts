/**
 * Pure timer math (§68): the server owns time, the client only ever recomputes
 * remaining milliseconds from the last `{server_now, effective_end_at}` pair it
 * received plus a `performance.now()` delta. Never `Date.now()` — a device
 * clock skew must never change what "expired" means.
 */
export interface TimerSync {
  /** epoch ms of `server_now` at the moment of the last sync */
  serverNow: number
  /** epoch ms of `effective_end_at`, or `null` when the assessment has no deadline (D12) */
  effectiveEndAt: number | null
  /** `performance.now()` captured at the same instant as `serverNow` */
  syncedAtPerfNow: number
}

/** `null` means "no timer" (untimed QUIZ) — never treated as expired. */
export function computeRemainingMs(sync: TimerSync, nowPerf: number): number | null {
  if (sync.effectiveEndAt === null) {
    return null
  }

  const elapsedSinceSync = nowPerf - sync.syncedAtPerfNow
  const serverNowAtNow = sync.serverNow + elapsedSinceSync
  return sync.effectiveEndAt - serverNowAtNow
}

export type TimerWarningLevel = "none" | "5min" | "1min" | "expired"

const FIVE_MINUTES_MS = 5 * 60 * 1000
const ONE_MINUTE_MS = 60 * 1000

/** Visual/aria-live thresholds at 5 min and 1 min remaining (§54). */
export function timerWarningLevel(remainingMs: number | null): TimerWarningLevel {
  if (remainingMs === null) {
    return "none"
  }
  if (remainingMs <= 0) {
    return "expired"
  }
  if (remainingMs <= ONE_MINUTE_MS) {
    return "1min"
  }
  if (remainingMs <= FIVE_MINUTES_MS) {
    return "5min"
  }
  return "none"
}
