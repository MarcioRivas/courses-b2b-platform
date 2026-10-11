import type { ActionErrorCode } from "@/lib/errors"
import { messagingMessages } from "@/lib/messages/messaging"

export type MessagingErrorCode = keyof typeof messagingMessages.errors

const ACTION_CODE_MAP: Record<MessagingErrorCode, ActionErrorCode> = {
  FORBIDDEN: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  SELF_CONVERSATION: "VALIDATION",
  MEMBER_INACTIVE: "FORBIDDEN",
  INVALID_BODY: "VALIDATION",
  RATE_LIMITED: "LOCKED",
  UNKNOWN: "INTERNAL",
}

// FORBIDDEN last: it is a substring of no other code, but keep specific codes first anyway.
const KNOWN_CODES: MessagingErrorCode[] = [
  "SELF_CONVERSATION",
  "MEMBER_INACTIVE",
  "INVALID_BODY",
  "RATE_LIMITED",
  "NOT_FOUND",
  "FORBIDDEN",
]

/**
 * The messaging RPCs raise their domain error as the exception message
 * (`raise exception 'MEMBER_INACTIVE'`). Anything unrecognised maps to a
 * generic error; the raw Postgres message never reaches the client.
 */
export function messagingRpcErrorResult(error: { message?: string | null; code?: string | null } | null | undefined): {
  ok: false
  code: ActionErrorCode
  message: string
} {
  const message = error?.message ?? ""
  const found = KNOWN_CODES.find((code) => message.includes(code))

  if (found) {
    return { ok: false, code: ACTION_CODE_MAP[found], message: messagingMessages.errors[found] }
  }

  if (error?.code === "42501") {
    return { ok: false, code: "FORBIDDEN", message: messagingMessages.errors.FORBIDDEN }
  }

  return { ok: false, code: "INTERNAL", message: messagingMessages.errors.UNKNOWN }
}
