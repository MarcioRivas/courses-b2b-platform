/**
 * Shared error model for Server Actions (docs/code-standards.md "Error Handling").
 * Actions never throw to the client — they always return an ActionResult.
 */

import { messages } from "@/lib/messages/es"

export type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "VALIDATION"
  | "CONFLICT"
  | "EXPIRED"
  | "LOCKED"
  | "SAVE_FAILED"
  | "INTERNAL"

export class AppError extends Error {
  readonly code: ActionErrorCode

  constructor(code: ActionErrorCode, message: string) {
    super(message)
    this.name = "AppError"
    this.code = code
  }
}

export type ActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; code: ActionErrorCode; message: string }

interface PostgresErrorLike {
  code?: string
  message?: string
}

/** Postgres SQLSTATE -> generic action error, used by RPC-backed actions. */
const SQLSTATE_MAP: Record<string, ActionErrorCode> = {
  "22023": "VALIDATION", // invalid_parameter_value
  "23001": "CONFLICT", // restrict_violation — a guarded delete refused (C10)
  "23503": "CONFLICT", // foreign_key_violation — a RESTRICT FK still references the row
  "23505": "CONFLICT", // unique_violation
  "23514": "VALIDATION", // check_violation — e.g. an inverted availability window
  "42501": "FORBIDDEN", // insufficient_privilege
  P0002: "NOT_FOUND", // no_data_found
}

function isPostgresErrorLike(err: unknown): err is PostgresErrorLike {
  return typeof err === "object" && err !== null && ("code" in err || "message" in err)
}

/** Business rules raised by DB triggers with a recognisable token in the message. */
const DB_RULE_MARKERS = [
  "QUESTION_IN_USE_ELSEWHERE",
  "CROSS_EDITION_LINK",
  "ACCESS_TYPE_LOCKED",
  "OFFERING_KIND_MISMATCH",
] as const

/** Maps unknown errors (RPC/PostgREST/auth) to a safe `ActionResult` error shape. */
export function toActionError(err: unknown): { code: ActionErrorCode; message: string } {
  if (err instanceof AppError) {
    return { code: err.code, message: err.message }
  }

  if (isPostgresErrorLike(err) && err.message) {
    const marker = DB_RULE_MARKERS.find((m) => err.message?.includes(m))
    if (marker) return { code: "CONFLICT", message: messages.errors[marker] }
  }

  if (isPostgresErrorLike(err) && err.code) {
    const mapped = SQLSTATE_MAP[err.code]
    if (mapped) {
      // Never surface the raw Postgres message to the client — always the
      // canonical Spanish copy for the mapped error code (W4).
      return { code: mapped, message: messages.errors[mapped] }
    }
  }

  return { code: "INTERNAL", message: messages.errors.INTERNAL }
}
