"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import { roleHome } from "@/lib/auth/role-home"
import { messages } from "@/lib/messages/es"
import type { ActionResult } from "@/lib/errors"
import { verifyOtpSchema, type VerifyOtpInput } from "../schemas/auth-schemas"

/**
 * Verifies the OTP. On success this redirects server-side — it never returns
 * a "success" ActionResult — to `/register/[token]/complete` (register mode)
 * or to the role home (login mode).
 */
export async function verifyOtp(input: VerifyOtpInput): Promise<ActionResult<never>> {
  const parsed = verifyOtpSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const { email, otp, mode, token } = parsed.data
  const supabase = await createClient()

  const { error } = await supabase.auth.verifyOtp({ email, token: otp, type: "email" })

  if (error) {
    return { ok: false, code: "VALIDATION", message: messages.login.invalidOtp }
  }

  if (mode === "register" && token) {
    return redirect(`/register/${token}/complete`)
  }

  const ctx = await getSessionContext()
  return redirect(ctx ? roleHome(ctx) : "/login")
}
