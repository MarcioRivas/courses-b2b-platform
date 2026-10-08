import type { MyTaskSubmission } from "../types"

export type TaskSubmissionPhase =
  /** `available_from` has not arrived yet. */
  | "NOT_OPEN"
  /** Before the deadline: submit or replace freely. */
  | "OPEN"
  /** After the deadline, late submissions allowed and still possible (no entrega yet, or an ungraded late one). */
  | "LATE_OPEN"
  /** After the deadline and nothing more can change. */
  | "CLOSED"

/**
 * Mirrors the rule `task_submission_check` enforces, so the screen never
 * offers an upload the RPC would refuse. The RPC remains the authority.
 */
export function taskSubmissionPhase(
  settings: { availableFrom: string | null; availableUntil: string; allowLateSubmissions: boolean },
  submission: MyTaskSubmission | null,
  now: Date = new Date()
): TaskSubmissionPhase {
  if (settings.availableFrom && now < new Date(settings.availableFrom)) {
    return "NOT_OPEN"
  }
  if (now < new Date(settings.availableUntil)) {
    return "OPEN"
  }
  if (
    settings.allowLateSubmissions &&
    (submission === null || (submission.submittedLate && submission.status !== "GRADED"))
  ) {
    return "LATE_OPEN"
  }
  return "CLOSED"
}
