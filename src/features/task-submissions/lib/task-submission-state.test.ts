import { describe, expect, it } from "vitest"
import { taskSubmissionPhase } from "./task-submission-state"
import type { MyTaskSubmission } from "../types"

describe("taskSubmissionPhase", () => {
  const now = new Date("2026-10-15T12:00:00Z")

  const makeSubmission = (overrides: Partial<MyTaskSubmission>): MyTaskSubmission => ({
    attemptId: "attempt-123",
    status: "SUBMITTED",
    submittedAt: "2026-10-15T10:00:00Z",
    submittedLate: false,
    scorePercent: null,
    scoreLabel: null,
    passed: null,
    feedback: null,
    files: [],
    ...overrides,
  })

  // NotOpen phase tests
  describe("NOT_OPEN phase", () => {
    it("returns NOT_OPEN when availableFrom is in the future", () => {
      const settings = {
        availableFrom: "2026-10-15T13:00:00Z",
        availableUntil: "2026-10-15T14:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null, now)
      expect(phase).toBe("NOT_OPEN")
    })

    it("returns NOT_OPEN even if deadline has passed but availableFrom is in the future", () => {
      const settings = {
        availableFrom: "2026-10-15T13:00:00Z",
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null, now)
      expect(phase).toBe("NOT_OPEN")
    })
  })

  // Open phase tests
  describe("OPEN phase", () => {
    it("returns OPEN when no availableFrom and before deadline", () => {
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T13:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null, now)
      expect(phase).toBe("OPEN")
    })

    it("returns OPEN when availableFrom is in the past and before deadline", () => {
      const settings = {
        availableFrom: "2026-10-15T10:00:00Z",
        availableUntil: "2026-10-15T13:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null, now)
      expect(phase).toBe("OPEN")
    })

    it("returns OPEN even with a submitted on-time attempt (can replace)", () => {
      const submission = makeSubmission({ status: "SUBMITTED", submittedLate: false })
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T13:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, submission, now)
      expect(phase).toBe("OPEN")
    })

    it("returns OPEN even with a GRADED attempt before deadline", () => {
      const submission = makeSubmission({
        status: "GRADED",
        submittedLate: false,
        scorePercent: 85,
        scoreLabel: "Muy bueno",
        passed: true,
      })
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T13:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, submission, now)
      expect(phase).toBe("OPEN")
    })
  })

  // Closed phase (no late submissions allowed)
  describe("CLOSED phase (no late submissions)", () => {
    it("returns CLOSED when past deadline and no late submissions", () => {
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null, now)
      expect(phase).toBe("CLOSED")
    })

    it("returns CLOSED when past deadline with on-time submission and no late submissions", () => {
      const submission = makeSubmission({ status: "SUBMITTED", submittedLate: false })
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, submission, now)
      expect(phase).toBe("CLOSED")
    })

    it("returns CLOSED when past deadline with graded submission and no late submissions", () => {
      const submission = makeSubmission({
        status: "GRADED",
        submittedLate: false,
        scorePercent: 85,
        passed: true,
        feedback: "Good",
      })
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, submission, now)
      expect(phase).toBe("CLOSED")
    })
  })

  // Late open phase
  describe("LATE_OPEN phase", () => {
    it("returns LATE_OPEN when past deadline, late submissions allowed, and no submission yet", () => {
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: true,
      }
      const phase = taskSubmissionPhase(settings, null, now)
      expect(phase).toBe("LATE_OPEN")
    })

    it("returns LATE_OPEN when past deadline, late submissions allowed, and has ungraded late submission", () => {
      const submission = makeSubmission({ status: "SUBMITTED", submittedLate: true })
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: true,
      }
      const phase = taskSubmissionPhase(settings, submission, now)
      expect(phase).toBe("LATE_OPEN")
    })

    it("returns CLOSED when past deadline, late submissions allowed, but on-time submission exists (frozen)", () => {
      const submission = makeSubmission({ status: "SUBMITTED", submittedLate: false })
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: true,
      }
      const phase = taskSubmissionPhase(settings, submission, now)
      expect(phase).toBe("CLOSED")
    })

    it("returns CLOSED when past deadline, late submissions allowed, but graded late submission exists", () => {
      const submission = makeSubmission({
        status: "GRADED",
        submittedLate: true,
        scorePercent: 75,
        passed: true,
        feedback: "Good work",
      })
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: true,
      }
      const phase = taskSubmissionPhase(settings, submission, now)
      expect(phase).toBe("CLOSED")
    })

    it("returns CLOSED when past deadline, late submissions allowed, but graded on-time submission exists", () => {
      const submission = makeSubmission({
        status: "GRADED",
        submittedLate: false,
        scorePercent: 85,
        passed: true,
        feedback: "Excellent",
      })
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T11:00:00Z",
        allowLateSubmissions: true,
      }
      const phase = taskSubmissionPhase(settings, submission, now)
      expect(phase).toBe("CLOSED")
    })
  })

  // Edge cases
  describe("edge cases", () => {
    it("treats now = deadline as past deadline (not OPEN)", () => {
      const settings = {
        availableFrom: null,
        availableUntil: "2026-10-15T12:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null, now)
      expect(phase).toBe("CLOSED")
    })

    it("treats now = availableFrom as open (not NOT_OPEN)", () => {
      const settings = {
        availableFrom: "2026-10-15T12:00:00Z",
        availableUntil: "2026-10-15T13:00:00Z",
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null, now)
      expect(phase).toBe("OPEN")
    })

    it("uses current time by default", () => {
      const futureDate = new Date()
      futureDate.setDate(futureDate.getDate() + 1)
      const settings = {
        availableFrom: null,
        availableUntil: futureDate.toISOString(),
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null)
      expect(phase).toBe("OPEN")
    })

    it("handles ISO string dates correctly", () => {
      const isoNow = new Date()
      const isoPast = new Date(isoNow.getTime() - 3600000)
      const isoFuture = new Date(isoNow.getTime() + 3600000)

      const settings = {
        availableFrom: isoPast.toISOString(),
        availableUntil: isoFuture.toISOString(),
        allowLateSubmissions: false,
      }
      const phase = taskSubmissionPhase(settings, null, isoNow)
      expect(phase).toBe("OPEN")
    })
  })
})
