"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { answerSchema } from "../schemas/attempt-schemas"
import { attemptRpcErrorResult } from "../lib/errors"
import type { SubmitAttemptResult } from "../types"

const inputSchema = z.object({
  attemptId: z.guid(),
  sessionId: z.guid(),
  answers: z.array(answerSchema).max(100).optional(),
})

export type SubmitAttemptInput = z.infer<typeof inputSchema>

/**
 * Upserts any still-pending answers and finalizes in the same RPC transaction
 * (D1) — there is no window between "last save" and "submit" for the deadline
 * to fall into. Calling this twice is not an error: the RPC returns whatever
 * the attempt already is.
 */
export async function submitAttempt(input: SubmitAttemptInput): Promise<ActionResult<SubmitAttemptResult>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("submit_attempt", {
    p_attempt: parsed.data.attemptId,
    p_session: parsed.data.sessionId,
    p_answers: parsed.data.answers ?? [],
  })

  if (error) {
    return attemptRpcErrorResult(error)
  }

  const row = data?.[0]
  if (!row) {
    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  revalidatePath(`/learn/attempts/${parsed.data.attemptId}`)

  return {
    ok: true,
    data: {
      status: row.status,
      totalScore: row.total_score === null ? null : Number(row.total_score),
      scorePercent: row.score_percent === null ? null : Number(row.score_percent),
      scoreLabel: row.score_label,
    },
  }
}
