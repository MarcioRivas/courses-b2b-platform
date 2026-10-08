import type { ActionErrorCode } from "@/lib/errors"
import { messages } from "@/lib/messages/es"

export type RegistrationRpcError =
  | { kind: "redirect"; to: string }
  | { kind: "error"; code: ActionErrorCode; message: string }

/**
 * Maps the domain markers raised by `complete_registration` (matched on the
 * RPC message) to a redirect or a form error. Returns null for anything else
 * so the caller falls back to the generic SQLSTATE mapping.
 */
export function mapRegistrationRpcError(rpcMessage: string): RegistrationRpcError | null {
  // OTP-first flow: the auth user already exists, so an exhausted link goes to
  // /register-required instead of the generic invalid-link text.
  if (rpcMessage.includes("LINK_EXHAUSTED")) {
    return { kind: "redirect", to: "/register-required?reason=link-exhausted" }
  }
  if (rpcMessage.includes("DNI_TAKEN")) {
    return { kind: "error", code: "CONFLICT", message: messages.register.dniTaken }
  }
  if (rpcMessage.includes("INVALID_PROFILE")) {
    return { kind: "error", code: "VALIDATION", message: messages.register.invalidProfile }
  }
  return null
}
