import { describe, expect, it } from "vitest"
import {
  type GateCheckpoint,
  SKIP_TOLERANCE_S,
  evaluateTick,
  evaluateEnded,
  initialMaxWatched,
  nextPending,
  segmentStart,
  skipTolerance,
} from "@/features/video-checkpoints/lib/checkpoint-gate"

describe("checkpoint-gate", () => {
  const c1: GateCheckpoint = { id: "c1", atSeconds: 30, passed: false }
  const c2: GateCheckpoint = { id: "c2", atSeconds: 75, passed: false }
  const c3: GateCheckpoint = { id: "c3", atSeconds: 120, passed: false }

  describe("nextPending", () => {
    it("returns the first unpassed checkpoint in time order", () => {
      const checkpoints = [c3, c1, c2]
      expect(nextPending(checkpoints)).toEqual(c1)
    })

    it("skips passed checkpoints and returns the first unpassed", () => {
      const passed = { ...c1, passed: true }
      const checkpoints = [passed, c2]
      expect(nextPending(checkpoints)).toEqual(c2)
    })

    it("returns null when all checkpoints are passed", () => {
      const all = [{ ...c1, passed: true }, { ...c2, passed: true }]
      expect(nextPending(all)).toBeNull()
    })

    it("returns null for empty checkpoints", () => {
      expect(nextPending([])).toBeNull()
    })

    it("orders by atSeconds when multiple are unpassed", () => {
      const checkpoints = [c3, c1, { ...c2, passed: true }, { id: "c0", atSeconds: 15, passed: false }]
      expect(nextPending(checkpoints)).toEqual({ id: "c0", atSeconds: 15, passed: false })
    })
  })

  describe("skipTolerance", () => {
    it("returns SKIP_TOLERANCE_S when elapsed is small", () => {
      expect(skipTolerance(100, 1)).toBe(SKIP_TOLERANCE_S)
    })

    it("grows with elapsed wall time and playback rate", () => {
      expect(skipTolerance(5000, 1)).toBeGreaterThan(SKIP_TOLERANCE_S)
      expect(skipTolerance(5000, 2)).toBeGreaterThan(skipTolerance(5000, 1))
    })

    it("clamps playback rate to minimum 1", () => {
      const result = skipTolerance(2000, 0.5)
      const expected = Math.max(SKIP_TOLERANCE_S, (2000 / 1000) * 1 + 1)
      expect(result).toBe(expected)
    })

    it("formula: max(SKIP_TOLERANCE_S, (elapsedMs/1000) * max(rate,1) + 1)", () => {
      const elapsed = 10000
      const rate = 2
      const expected = Math.max(SKIP_TOLERANCE_S, (elapsed / 1000) * rate + 1)
      expect(skipTolerance(elapsed, rate)).toBe(expected)
    })
  })

  describe("evaluateTick", () => {
    it("returns none and grows maxWatched during normal playback", () => {
      const result = evaluateTick({ time: 12, maxWatched: 10, next: c1 })
      expect(result).toEqual({ action: "none", maxWatched: 12 })
    })

    it("returns none when no next checkpoint (all passed)", () => {
      const result = evaluateTick({ time: 100, maxWatched: 50, next: null })
      expect(result).toEqual({ action: "none", maxWatched: 100 })
    })

    it("pauses at checkpoint when time reaches atSeconds", () => {
      const result = evaluateTick({ time: 30, maxWatched: 29, next: c1 })
      expect(result).toEqual({ action: "pause-at-checkpoint", seekTo: 30, checkpointId: "c1", maxWatched: 30 })
    })

    it("blocks skip when jumping forward past default tolerance", () => {
      const result = evaluateTick({ time: 30 + SKIP_TOLERANCE_S + 0.5, maxWatched: 10, next: c1 })
      expect(result).toEqual({ action: "block-skip", seekTo: 10, maxWatched: 10 })
    })

    it("allows jump within default tolerance", () => {
      const result = evaluateTick({ time: 10 + SKIP_TOLERANCE_S, maxWatched: 10, next: c1 })
      expect(result).toEqual({ action: "none", maxWatched: 10 + SKIP_TOLERANCE_S })
    })

    it("uses custom tolerance when provided", () => {
      const customTolerance = 5
      const result = evaluateTick({ time: 15, maxWatched: 10, next: c1, tolerance: customTolerance })
      expect(result).toEqual({ action: "none", maxWatched: 15 })
    })

    it("blocks skip using custom tolerance", () => {
      const customTolerance = 3
      const result = evaluateTick({ time: 20, maxWatched: 10, next: c1, tolerance: customTolerance })
      expect(result).toEqual({ action: "block-skip", seekTo: 10, maxWatched: 10 })
    })

    it("seeks to maxWatched clamped to checkpoint time when skip detected", () => {
      const result = evaluateTick({ time: 100, maxWatched: 40, next: c1 })
      expect(result).toEqual({ action: "block-skip", seekTo: 30, maxWatched: 40 })
    })

    it("pauses when reaching checkpoint exactly", () => {
      const result = evaluateTick({ time: 30, maxWatched: 28, next: c1 })
      expect(result).toEqual({ action: "pause-at-checkpoint", seekTo: 30, checkpointId: "c1", maxWatched: 30 })
    })

    it("handles time exactly at tolerance boundary", () => {
      const boundary = 10 + SKIP_TOLERANCE_S
      const result = evaluateTick({ time: boundary, maxWatched: 10, next: c1 })
      expect(result).toEqual({ action: "none", maxWatched: boundary })
    })
  })

  describe("evaluateEnded", () => {
    it("returns ended when no next checkpoint", () => {
      const result = evaluateEnded({ maxWatched: 100, duration: 100, next: null })
      expect(result).toEqual({ action: "ended" })
    })

    it("opens quiz when student watched up to checkpoint", () => {
      const next = { id: "cp-end", atSeconds: 90, passed: false }
      const result = evaluateEnded({ maxWatched: 100, duration: 100, next })
      expect(result).toEqual({ action: "open-quiz", checkpointId: "cp-end" })
    })

    it("blocks skip when student hasn't watched up to checkpoint", () => {
      const next = { id: "cp-end", atSeconds: 90, passed: false }
      const result = evaluateEnded({ maxWatched: 80, duration: 100, next })
      expect(result).toEqual({ action: "block-skip", seekTo: 80 })
    })

    it("clamps checkpoint to video duration", () => {
      const next = { id: "cp-beyond", atSeconds: 150, passed: false }
      const result = evaluateEnded({ maxWatched: 100, duration: 100, next })
      expect(result).toEqual({ action: "open-quiz", checkpointId: "cp-beyond" })
    })

    it("allows opening quiz at exact tolerance boundary", () => {
      const next = { id: "cp-boundary", atSeconds: 50, passed: false }
      const result = evaluateEnded({ maxWatched: 50 + SKIP_TOLERANCE_S, duration: 60, next })
      expect(result).toEqual({ action: "open-quiz", checkpointId: "cp-boundary" })
    })

    it("blocks skip just before tolerance is reached", () => {
      const next = { id: "cp-close", atSeconds: 90, passed: false }
      const result = evaluateEnded({ maxWatched: 85, duration: 100, next })
      expect(result).toEqual({ action: "block-skip", seekTo: 85 })
    })

    it("uses next.atSeconds when duration is 0 or negative", () => {
      const next = { id: "cp-no-duration", atSeconds: 30, passed: false }
      const result = evaluateEnded({ maxWatched: 35, duration: 0, next })
      expect(result).toEqual({ action: "open-quiz", checkpointId: "cp-no-duration" })
    })
  })

  describe("segmentStart", () => {
    it("returns 0 for the first checkpoint", () => {
      const checkpoints = [c1, c2, c3]
      expect(segmentStart(checkpoints, "c1")).toBe(0)
    })

    it("returns previous checkpoint time for middle checkpoints", () => {
      const checkpoints = [c1, c2, c3]
      expect(segmentStart(checkpoints, "c2")).toBe(30)
      expect(segmentStart(checkpoints, "c3")).toBe(75)
    })

    it("returns 0 when checkpoint not found", () => {
      const checkpoints = [c1, c2]
      expect(segmentStart(checkpoints, "unknown")).toBe(0)
    })

    it("returns the closest previous checkpoint time", () => {
      const checkpoints = [
        { id: "c0", atSeconds: 10, passed: true },
        c1,
        c2,
        c3,
      ]
      expect(segmentStart(checkpoints, "c3")).toBe(75)
      expect(segmentStart(checkpoints, "c2")).toBe(30)
      expect(segmentStart(checkpoints, "c1")).toBe(10)
    })
  })

  describe("initialMaxWatched", () => {
    it("returns 0 when no checkpoints are passed", () => {
      const checkpoints = [c1, c2, c3]
      expect(initialMaxWatched(checkpoints)).toBe(0)
    })

    it("returns the furthest passed checkpoint", () => {
      const checkpoints = [
        { ...c1, passed: true },
        { ...c2, passed: true },
        c3,
      ]
      expect(initialMaxWatched(checkpoints)).toBe(75)
    })

    it("handles all passed checkpoints", () => {
      const checkpoints = [
        { ...c1, passed: true },
        { ...c2, passed: true },
        { ...c3, passed: true },
      ]
      expect(initialMaxWatched(checkpoints)).toBe(120)
    })

    it("finds max even if passed checkpoints are unordered", () => {
      const checkpoints = [
        { ...c3, passed: true },
        c2,
        { ...c1, passed: true },
      ]
      expect(initialMaxWatched(checkpoints)).toBe(120)
    })

    it("returns 0 for empty checkpoints", () => {
      expect(initialMaxWatched([])).toBe(0)
    })
  })
})
