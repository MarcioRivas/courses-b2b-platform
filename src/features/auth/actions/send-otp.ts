"use server"

import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { sendOtpSchema, type SendOtpInput } from "../schemas/auth-schemas"

/** GoTrue error codes that mean "no account exists for this email" (login mode, C4). */
const NO_ACCOUNT_CODES = new Set(["otp_disabled", "signup_disabled", "user_not_found"])

/**
 * Sends a 6-digit OTP by email.
 * - `login`: never creates an account (`shouldCreateUser: false`) — C4.
 * - `register`: requires a still-valid registration link token, then allows
 *   account creation (`shouldCreateUser: true`) — the link is the gate, not
 *   `enable_signup` (C4/D37).
 */
export async function sendOtp(input: SendOtpInput): Promise<ActionResult<{ email: string }>> {
  const parsed = sendOtpSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const { email, mode, token } = parsed.data
  const supabase = await createClient()

  if (mode === "register") {
    if (!token) {
      return { ok: false, code: "VALIDATION", message: messages.register.invalidLinkDescription }
    }

    const { data, error } = await supabase.rpc("get_registration_link_public", { p_token: token })
    const link = data?.[0]

    if (error || !link || !link.valid) {
      return { ok: false, code: "EXPIRED", message: messages.register.invalidLinkDescription }
    }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: mode === "register" },
  })

  if (error) {
    // GoTrue's error codes (not a Postgres SQLSTATE) distinguish "no account"
    // from real rate-limiting; branch on `error.code`, not the raw message (W5).
    if (NO_ACCOUNT_CODES.has(error.code ?? "")) {
      return { ok: false, code: "NOT_FOUND", message: messages.login.userNotFound }
    }

    if (error.code === "over_email_send_rate_limit") {
      return { ok: false, code: "LOCKED", message: messages.login.rateLimited }
    }

    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  return { ok: true, data: { email } }
}
