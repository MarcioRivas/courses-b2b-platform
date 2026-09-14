"use server"

import { z } from "zod"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { saveAnswersSchema } from "../schemas/attempt-schemas"
import { attemptRpcErrorResult } from "../lib/errors"
import type { AcceptedAnswer, SaveAnswersResult } from "../types"

const inputSchema = saveAnswersSchema.extend({ attemptId: z.guid() })

export type SaveAnswersInput = z.infer<typeof inputSchema>

function parseAccepted(json: unknown): AcceptedAnswer[] {
  if (!Array.isArray(json)) {
    return []
  }
  const accepted: AcceptedAnswer[] = []
  for (const item of json) {
    if (typeof item === "object" && item !== null && "attempt_question_id" in item && "client_seq" in item) {
      const record = item as Record<string, unknown>
      accepted.push({
        attempt_question_id: String(record.attempt_question_id),
        client_seq: Number(record.client_seq),
      })
    }
  }
  return accepted
}

/**
 * Batched autosave (D4/D30). Never raises "expired" — the RPC reports it
 * through the returned `status`, which the caller (the autosave hook)
 * inspects to stop saving and flip to the expired UI without losing whatever
 * was already accepted.
 */
export async function saveAnswers(input: SaveAnswersInput): Promise<ActionResult<SaveAnswersResult>> {
  const parsed = inputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("save_answers_batch", {
    p_attempt: parsed.data.attemptId,
    p_session: parsed.data.sessionId,
    p_answers: parsed.data.answers,
  })

  if (error) {
    return attemptRpcErrorResult(error)
  }

  const row = data?.[0]
  if (!row) {
    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  return {
    ok: true,
    data: {
      accepted: parseAccepted(row.accepted),
      serverNow: row.server_now,
      effectiveEndAt: row.effective_end_at,
      status: row.status,
    },
  }
}
