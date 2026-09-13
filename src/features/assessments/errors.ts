/**
 * Maps assessment domain error codes (RPC exception messages, §53 of
 * `docs/assessment-design.md`) to Spanish copy. Dependency-free besides the
 * messages dictionary so any Phase 5 agent (player, grading) can import it
 * without pulling in this feature's actions/queries.
 */
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"

const { errors } = teachAssessmentMessages

const KNOWN_CODES = [
  "ASSESSMENT_NOT_AVAILABLE",
  "ASSESSMENT_EXPIRED",
  "ATTEMPT_EXPIRED",
  "ATTEMPT_LIMIT_REACHED",
  "ALREADY_COMPLETED",
  "SESSION_LOCKED",
  "MODULE_LOCKED",
  "INVALID_BLOCK_TYPE",
  "INVALID_ANSWER",
  "SAVE_FAILED",
  "CONFLICT_HAS_ATTEMPTS",
  "CONFLICT_HAS_BLOCKS",
] as const

export type AssessmentDomainErrorCode = (typeof KNOWN_CODES)[number]

/**
 * Looks up the Spanish copy for a raw RPC error code or message. RPCs raise
 * exceptions whose `.message` IS the code (e.g. `"SESSION_LOCKED"`); some
 * wrap it (`"CONFLICT_HAS_ATTEMPTS"` inside a longer Postgres message), so
 * this checks for substring containment rather than exact equality.
 */
export function assessmentErrorMessage(code: string): string {
  const match = KNOWN_CODES.find((known) => code.includes(known))
  if (match) {
    return errors[match]
  }
  return errors.SAVE_FAILED
}
