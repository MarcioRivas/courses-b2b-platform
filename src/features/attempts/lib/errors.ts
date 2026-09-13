import type { ActionErrorCode } from "@/lib/errors"
import { learnAssessmentMessages } from "@/lib/messages/learn-assessments"

export type AttemptErrorCode = keyof typeof learnAssessmentMessages.errors

const KNOWN_CODES = Object.keys(learnAssessmentMessages.errors) as AttemptErrorCode[]

/**
 * The RPCs raise their domain errors as the exception *message* (see the
 * phase brief's RPC table) — e.g. `raise exception 'SESSION_LOCKED' ...`.
 * `ATTEMPT_EXPIRED`/`ALREADY_COMPLETED` are never raised as exceptions
 * (`save_answers_batch` reports expiry through the returned `status` instead,
 * by design — see `20260911210400_assessment_save_rpcs.sql`); those two codes
 * are assigned by the caller from state, not parsed from an error here.
 */
export function parseAttemptErrorCode(message: string | null | undefined): AttemptErrorCode {
  if (!message) {
    return "UNKNOWN"
  }
  const found = KNOWN_CODES.find((code) => code !== "UNKNOWN" && message.includes(code))
  return found ?? "UNKNOWN"
}

const ACTION_CODE_MAP: Record<AttemptErrorCode, ActionErrorCode> = {
  ASSESSMENT_NOT_AVAILABLE: "FORBIDDEN",
  ASSESSMENT_EXPIRED: "EXPIRED",
  ATTEMPT_EXPIRED: "EXPIRED",
  ATTEMPT_LIMIT_REACHED: "CONFLICT",
  ALREADY_COMPLETED: "CONFLICT",
  SESSION_LOCKED: "LOCKED",
  MODULE_LOCKED: "LOCKED",
  INVALID_BLOCK_TYPE: "VALIDATION",
  INVALID_ANSWER: "VALIDATION",
  SAVE_FAILED: "SAVE_FAILED",
  CONNECTION_LOST: "INTERNAL",
  UNKNOWN: "INTERNAL",
}

interface RpcErrorLike {
  message?: string | null
}

/** Maps an RPC error (or its absence) to the `ActionResult` error shape, with Spanish copy. */
export function attemptRpcErrorResult(error: RpcErrorLike | null | undefined): {
  ok: false
  code: ActionErrorCode
  message: string
} {
  const code = parseAttemptErrorCode(error?.message)
  return { ok: false, code: ACTION_CODE_MAP[code], message: learnAssessmentMessages.errors[code] }
}
