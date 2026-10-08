"use server"

import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { getSessionContext } from "@/lib/auth/session"
import { roleHome } from "@/lib/auth/role-home"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { mapRegistrationRpcError } from "../registration-rpc-error"
import { completeRegistrationSchema, type CompleteRegistrationInput } from "../schemas/auth-schemas"

/**
 * Atomically creates `profiles` + `profile_private` + the org membership via
 * `complete_registration` (locks the link `FOR UPDATE`). On success this
 * redirects server-side to the new member's role home.
 */
export async function completeRegistration(
  input: CompleteRegistrationInput
): Promise<ActionResult<never>> {
  const parsed = completeRegistrationSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  const supabase = await createClient()
  const { error } = await supabase.rpc("complete_registration", {
    p_token: parsed.data.token,
    p_first_name: parsed.data.firstName,
    p_last_name: parsed.data.lastName,
    p_phone: parsed.data.phone,
    p_dni: parsed.data.dni,
  })

  if (error) {
    // OTP-first flow: the auth user already exists, so an exhausted link is
    // surfaced on /register-required instead of the generic invalid-link text.
    const known = mapRegistrationRpcError(error.message)
    if (known?.kind === "redirect") {
      return redirect(known.to)
    }
    if (known) {
      return { ok: false, code: known.code, message: known.message }
    }
    const actionError = toActionError(error)
    if (actionError.code === "CONFLICT") {
      return { ok: false, ...actionError, message: messages.register.alreadyRegistered }
    }
    if (actionError.code === "FORBIDDEN") {
      return { ok: false, ...actionError, message: messages.register.membershipInactive }
    }
    return { ok: false, ...actionError, message: messages.register.invalidLinkDescription }
  }

  const ctx = await getSessionContext()
  return redirect(ctx ? roleHome(ctx) : "/register-required")
}
