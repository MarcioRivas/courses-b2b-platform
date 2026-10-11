import { describe, expect, it } from "vitest"
import { resolveCourseOutcome, type CourseOutcomeInput } from "@/features/transcript/lib/resolve-course-outcome"

type Assessment = CourseOutcomeInput["assessments"][number]

const NOW = new Date("2026-10-11T12:00:00.000Z")
const PAST = "2026-09-01T00:00:00.000Z"
const FUTURE = "2026-12-01T00:00:00.000Z"

const graded = (overrides: Partial<Assessment> = {}): Assessment => ({
  lastStatus: "GRADED",
  passed: true,
  attemptsUsed: 1,
  maxAttempts: 2,
  ...overrides,
})

const base = (overrides: Partial<CourseOutcomeInput> = {}): CourseOutcomeInput => ({
  enrollmentStatus: "ACTIVE",
  endsAt: FUTURE,
  assessments: [graded()],
  now: NOW,
  ...overrides,
})

describe("resolveCourseOutcome", () => {
  it("CANCELLED when the enrollment is cancelled, whatever the grades say", () => {
    expect(
      resolveCourseOutcome(base({ enrollmentStatus: "CANCELLED", assessments: [graded({ passed: true })] }))
    ).toBe("CANCELLED")
    expect(resolveCourseOutcome(base({ enrollmentStatus: "CANCELLED", endsAt: PAST }))).toBe("CANCELLED")
  })

  it("APPROVED when completed and every published assessment's latest attempt is graded and passed", () => {
    const outcome = resolveCourseOutcome(
      base({
        enrollmentStatus: "COMPLETED",
        assessments: [graded(), graded({ attemptsUsed: 2 })],
      })
    )
    expect(outcome).toBe("APPROVED")
  })

  it("APPROVED wins over an edition that already ended", () => {
    const outcome = resolveCourseOutcome(
      base({ enrollmentStatus: "COMPLETED", endsAt: PAST, assessments: [graded()] })
    )
    expect(outcome).toBe("APPROVED")
  })

  it("APPROVED when completed with no assessments (every() on an empty list is true)", () => {
    expect(resolveCourseOutcome(base({ enrollmentStatus: "COMPLETED", assessments: [] }))).toBe("APPROVED")
  })

  it("not APPROVED when completed but an assessment has no attempt yet", () => {
    const outcome = resolveCourseOutcome(
      base({
        enrollmentStatus: "COMPLETED",
        assessments: [graded(), { lastStatus: null, passed: null, attemptsUsed: 0, maxAttempts: 2 }],
      })
    )
    expect(outcome).toBe("IN_PROGRESS")
  })

  it("FAILED when a latest attempt is graded, not passed, and no attempts are left", () => {
    const outcome = resolveCourseOutcome(
      base({
        assessments: [graded({ passed: false, attemptsUsed: 2, maxAttempts: 2 })],
      })
    )
    expect(outcome).toBe("FAILED")
  })

  it("IN_PROGRESS when a failed attempt has unlimited attempts (max_attempts null)", () => {
    const outcome = resolveCourseOutcome(
      base({
        assessments: [graded({ passed: false, attemptsUsed: 5, maxAttempts: null })],
      })
    )
    expect(outcome).toBe("IN_PROGRESS")
  })

  it("IN_PROGRESS when a failed attempt still has retries left", () => {
    const outcome = resolveCourseOutcome(
      base({
        assessments: [graded({ passed: false, attemptsUsed: 1, maxAttempts: 3 })],
      })
    )
    expect(outcome).toBe("IN_PROGRESS")
  })

  it("IN_PROGRESS when a failed attempt is below its max attempts (one retry left)", () => {
    const outcome = resolveCourseOutcome(
      base({
        assessments: [graded({ passed: false, attemptsUsed: 1, maxAttempts: 1 + 1 })],
      })
    )
    expect(outcome).toBe("IN_PROGRESS")
  })

  it("FAILED when the edition ended and the course is not approved", () => {
    const outcome = resolveCourseOutcome(base({ endsAt: PAST, assessments: [graded({ passed: true })] }))
    // Enrollment still ACTIVE (not COMPLETED) even though every grade passed: not approved, edition over.
    expect(outcome).toBe("FAILED")
  })

  it("FAILED when the edition ended with an assessment still pending correction", () => {
    const outcome = resolveCourseOutcome(
      base({
        endsAt: PAST,
        assessments: [{ lastStatus: "SUBMITTED", passed: null, attemptsUsed: 1, maxAttempts: 2 }],
      })
    )
    expect(outcome).toBe("FAILED")
  })

  it("IN_PROGRESS while the edition is open and a correction is pending (content done, grading pending)", () => {
    const outcome = resolveCourseOutcome(
      base({
        enrollmentStatus: "COMPLETED",
        assessments: [{ lastStatus: "SUBMITTED", passed: null, attemptsUsed: 1, maxAttempts: 2 }],
      })
    )
    expect(outcome).toBe("IN_PROGRESS")
  })

  it("IN_PROGRESS for an open-ended edition (endsAt null) with nothing graded yet", () => {
    const outcome = resolveCourseOutcome(
      base({ endsAt: null, assessments: [{ lastStatus: null, passed: null, attemptsUsed: 0, maxAttempts: 1 }] })
    )
    expect(outcome).toBe("IN_PROGRESS")
  })

  it("IN_PROGRESS when the edition ends in the future", () => {
    expect(resolveCourseOutcome(base({ endsAt: FUTURE, assessments: [] }))).toBe("IN_PROGRESS")
  })

  it("an edition whose end equals now is not yet ended (strict less-than)", () => {
    const outcome = resolveCourseOutcome(base({ endsAt: NOW.toISOString(), assessments: [] }))
    expect(outcome).toBe("IN_PROGRESS")
  })

  it("defaults now to the current time when no clock is injected", () => {
    const outcome = resolveCourseOutcome({
      enrollmentStatus: "ACTIVE",
      endsAt: "2001-01-01T00:00:00.000Z",
      assessments: [],
    })
    expect(outcome).toBe("FAILED")
  })

  it("a failed grade does not count as exhausted when the status is not GRADED", () => {
    const outcome = resolveCourseOutcome(
      base({
        assessments: [{ lastStatus: "IN_PROGRESS", passed: false, attemptsUsed: 2, maxAttempts: 2 }],
      })
    )
    expect(outcome).toBe("IN_PROGRESS")
  })
})
