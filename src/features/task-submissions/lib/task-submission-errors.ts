import type { ActionErrorCode } from "@/lib/errors"
import { taskSubmissionMessages } from "@/lib/messages/task-submissions"

export type TaskSubmissionErrorCode = keyof typeof taskSubmissionMessages.errors

const ACTION_CODE_MAP: Record<TaskSubmissionErrorCode, ActionErrorCode> = {
  NOT_ENROLLED: "FORBIDDEN",
  ENROLLMENT_CANCELLED: "FORBIDDEN",
  ASSESSMENT_NOT_AVAILABLE: "FORBIDDEN",
  WINDOW_NOT_OPEN: "EXPIRED",
  WINDOW_CLOSED: "EXPIRED",
  MODULE_LOCKED: "LOCKED",
  NO_FILES: "VALIDATION",
  TOO_MANY_FILES: "VALIDATION",
  INVALID_FILES: "VALIDATION",
  DEADLINE_NOT_PASSED: "LOCKED",
  ALREADY_GRADED: "CONFLICT",
  STALE_SUBMISSION: "CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  INVALID_ANSWER: "VALIDATION",
  UPLOAD_FAILED: "INTERNAL",
  UNKNOWN: "INTERNAL",
}

const KNOWN_CODES = (Object.keys(ACTION_CODE_MAP) as TaskSubmissionErrorCode[]).filter((code) => code !== "UNKNOWN")

/**
 * The TASK RPCs raise their domain errors as the exception message
 * (`raise exception 'WINDOW_CLOSED'`), same convention as the attempt RPCs.
 * Anything unrecognised maps to a generic error; the raw message never
 * reaches the client.
 */
export function taskRpcErrorResult(error: { message?: string | null; code?: string | null } | null | undefined): {
  ok: false
  code: ActionErrorCode
  message: string
} {
  const message = error?.message ?? ""
  const found = KNOWN_CODES.find((code) => message.includes(code))

  if (found) {
    return { ok: false, code: ACTION_CODE_MAP[found], message: taskSubmissionMessages.errors[found] }
  }

  if (error?.code === "42501") {
    return { ok: false, code: "FORBIDDEN", message: taskSubmissionMessages.errors.FORBIDDEN }
  }

  return { ok: false, code: "INTERNAL", message: taskSubmissionMessages.errors.UNKNOWN }
}
