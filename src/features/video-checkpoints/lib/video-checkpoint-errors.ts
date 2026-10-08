import type { ActionErrorCode } from "@/lib/errors"
import { videoCheckpointMessages } from "@/lib/messages/video-checkpoints"

type CheckpointErrorCode = keyof typeof videoCheckpointMessages.errors

const ACTION_CODE_MAP: Record<CheckpointErrorCode, ActionErrorCode> = {
  INVALID_CHECKPOINTS: "VALIDATION",
  CHECKPOINT_ORDER: "CONFLICT",
  INVALID_ANSWER: "VALIDATION",
  MODULE_LOCKED: "LOCKED",
  ENROLLMENT_CANCELLED: "FORBIDDEN",
  CHECKPOINTS_PENDING: "CONFLICT",
  FORBIDDEN: "FORBIDDEN",
  UNKNOWN: "INTERNAL",
}

const KNOWN = (Object.keys(ACTION_CODE_MAP) as CheckpointErrorCode[]).filter(
  (code) => code !== "UNKNOWN" && code !== "FORBIDDEN"
)

/**
 * The checkpoint RPCs raise domain errors as the exception message
 * (`raise exception 'CHECKPOINT_ORDER'`). Unknown errors never leak their
 * raw message: 42501 maps to a neutral FORBIDDEN, anything else to UNKNOWN.
 */
export function checkpointRpcErrorResult(error: { message?: string | null; code?: string | null } | null | undefined): {
  ok: false
  code: ActionErrorCode
  message: string
} {
  const message = error?.message ?? ""
  const found = KNOWN.find((code) => message.includes(code))
  if (found) {
    return { ok: false, code: ACTION_CODE_MAP[found], message: videoCheckpointMessages.errors[found] }
  }
  if (error?.code === "42501") {
    return { ok: false, code: "FORBIDDEN", message: videoCheckpointMessages.errors.FORBIDDEN }
  }
  return { ok: false, code: "INTERNAL", message: videoCheckpointMessages.errors.UNKNOWN }
}
