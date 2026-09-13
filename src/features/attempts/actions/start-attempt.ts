"use server"

import { redirect } from "next/navigation"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { attemptRpcErrorResult } from "../lib/errors"

const startAttemptSchema = z.object({
  enrollmentId: z.string().uuid(),
  assessmentId: z.string().uuid(),
})

export type StartAttemptInput = z.infer<typeof startAttemptSchema>

/**
 * `start_attempt` is idempotent (returns the existing `IN_PROGRESS` attempt if
 * there is one), so "Comenzar" and "Continuar" on the pre-flight screen call
 * the exact same action — the RPC decides whether this is a fresh start or a
 * resume. On success this never returns: it redirects into the player.
 */
export async function startAttempt(input: StartAttemptInput): Promise<ActionResult<never>> {
  const parsed = startAttemptSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const supabase = await createClient()

  const { data: attemptId, error } = await supabase.rpc("start_attempt", {
    p_enrollment: parsed.data.enrollmentId,
    p_assessment: parsed.data.assessmentId,
  })

  if (error || !attemptId) {
    return attemptRpcErrorResult(error)
  }

  redirect(`/learn/attempts/${attemptId}`)
}
