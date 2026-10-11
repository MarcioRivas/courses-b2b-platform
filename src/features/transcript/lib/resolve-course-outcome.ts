import type { CourseOutcome, EnrollmentStatus, TranscriptAssessment } from "../types"

export interface CourseOutcomeInput {
  enrollmentStatus: EnrollmentStatus
  /** Edition end date (ISO) or null when open-ended. */
  endsAt: string | null
  assessments: Pick<TranscriptAssessment, "lastStatus" | "passed" | "attemptsUsed" | "maxAttempts">[]
  now?: Date
}

/**
 * Course outcome of an enrollment (plan phase 3). Pass/fail comes from the
 * attempt's `passed` (score_scale_ranges.is_passing), never passing_score.
 *   CANCELLED   enrollment CANCELLED
 *   APPROVED    enrollment COMPLETED and every published assessment's latest attempt GRADED+passed
 *   FAILED      a latest attempt GRADED, not passed, no attempts left; or edition ended and not APPROVED
 *   IN_PROGRESS otherwise (includes "content done, grading pending")
 */
export function resolveCourseOutcome(input: CourseOutcomeInput): CourseOutcome {
  if (input.enrollmentStatus === "CANCELLED") {
    return "CANCELLED"
  }

  const allPassed = input.assessments.every((a) => a.lastStatus === "GRADED" && a.passed === true)
  if (input.enrollmentStatus === "COMPLETED" && allPassed) {
    return "APPROVED"
  }

  const exhausted = input.assessments.some(
    (a) => a.lastStatus === "GRADED" && a.passed === false && a.maxAttempts !== null && a.attemptsUsed >= a.maxAttempts
  )
  const ended = input.endsAt !== null && new Date(input.endsAt).getTime() < (input.now ?? new Date()).getTime()

  return exhausted || ended ? "FAILED" : "IN_PROGRESS"
}
