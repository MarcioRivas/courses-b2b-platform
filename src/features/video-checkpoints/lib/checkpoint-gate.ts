/**
 * Pure playback rules for checkpointed videos (no DOM, unit-tested). The
 * player calls `evaluateTick` every few hundred milliseconds while playing.
 *
 * - `maxWatched` is the furthest point reached by watching. While a
 *   checkpoint is pending, jumping more than `SKIP_TOLERANCE_S` past it is
 *   undone (seek back); rewinding is always free.
 * - Reaching the next pending checkpoint pauses there.
 * - Once every checkpoint is passed there are no restrictions.
 */

export interface GateCheckpoint {
  id: string
  atSeconds: number
  passed: boolean
}

export type TickResult =
  | { action: "none"; maxWatched: number }
  | { action: "pause-at-checkpoint"; seekTo: number; checkpointId: string; maxWatched: number }
  | { action: "block-skip"; seekTo: number; maxWatched: number }

/** Minimum slack before a forward jump counts as a skip. */
export const SKIP_TOLERANCE_S = 2

/**
 * How far playback may legitimately advance between two ticks: wall-clock
 * time elapsed × playback rate, plus a second of slack. Hidden tabs throttle
 * timers to ~1 s, and 2x speed doubles the distance, so a fixed bound would
 * mistake normal playback for a skip.
 */
export function skipTolerance(elapsedWallMs: number, playbackRate: number): number {
  return Math.max(SKIP_TOLERANCE_S, (elapsedWallMs / 1000) * Math.max(playbackRate, 1) + 1)
}

export function nextPending(checkpoints: GateCheckpoint[]): GateCheckpoint | null {
  return (
    [...checkpoints].filter((checkpoint) => !checkpoint.passed).sort((a, b) => a.atSeconds - b.atSeconds)[0] ??
    null
  )
}

export function evaluateTick(params: {
  time: number
  maxWatched: number
  next: GateCheckpoint | null
  tolerance?: number
}): TickResult {
  const { time, maxWatched, next, tolerance = SKIP_TOLERANCE_S } = params

  if (!next) {
    return { action: "none", maxWatched: Math.max(maxWatched, time) }
  }

  if (time > maxWatched + tolerance) {
    return { action: "block-skip", seekTo: Math.min(maxWatched, next.atSeconds), maxWatched }
  }

  if (time >= next.atSeconds) {
    return { action: "pause-at-checkpoint", seekTo: next.atSeconds, checkpointId: next.id, maxWatched: next.atSeconds }
  }

  return { action: "none", maxWatched: Math.max(maxWatched, time) }
}

/**
 * The video reached its end. Opening the next pending quiz is only right if
 * the student actually watched up to it (or it sits at/after the real end);
 * jumping to the end while paused must not skip straight to the quiz.
 */
export function evaluateEnded(params: {
  maxWatched: number
  duration: number
  next: GateCheckpoint | null
}): { action: "ended" } | { action: "open-quiz"; checkpointId: string } | { action: "block-skip"; seekTo: number } {
  const { maxWatched, duration, next } = params
  if (!next) {
    return { action: "ended" }
  }
  const target = duration > 0 ? Math.min(next.atSeconds, duration) : next.atSeconds
  if (maxWatched + SKIP_TOLERANCE_S < target) {
    return { action: "block-skip", seekTo: Math.min(maxWatched, next.atSeconds) }
  }
  return { action: "open-quiz", checkpointId: next.id }
}

/** Where "Volver a ver el fragmento" rewinds to: the previous checkpoint, or the start. */
export function segmentStart(checkpoints: GateCheckpoint[], checkpointId: string): number {
  const current = checkpoints.find((checkpoint) => checkpoint.id === checkpointId)
  if (!current) {
    return 0
  }
  const previous = checkpoints
    .filter((checkpoint) => checkpoint.atSeconds < current.atSeconds)
    .sort((a, b) => b.atSeconds - a.atSeconds)[0]
  return previous?.atSeconds ?? 0
}

/** A returning student may jump straight to the last checkpoint they passed. */
export function initialMaxWatched(checkpoints: GateCheckpoint[]): number {
  return checkpoints.filter((checkpoint) => checkpoint.passed).reduce((max, c) => Math.max(max, c.atSeconds), 0)
}
