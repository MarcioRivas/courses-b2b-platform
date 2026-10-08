"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { answerCheckpointSchema, type AnswerCheckpointInput } from "../schemas/video-checkpoint-schemas"
import { checkpointRpcErrorResult } from "../lib/video-checkpoint-errors"
import type { CheckpointResult } from "../types"

/**
 * Checks one checkpoint's answers server-side (the key never reaches the
 * browser) and records the attempt. Returns counts only — never which
 * answers were wrong, so "Reintentar" cannot be brute-forced.
 */
export async function answerVideoCheckpoint(input: AnswerCheckpointInput): Promise<ActionResult<CheckpointResult>> {
  const parsed = answerCheckpointSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: messages.errors.VALIDATION }
  }

  await requireOrgRole(["STUDENT"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("answer_video_checkpoint", {
    p_enrollment: parsed.data.enrollmentId,
    p_checkpoint: parsed.data.checkpointId,
    p_answers: parsed.data.answers,
  })

  const row = data?.[0]
  if (error || !row) {
    return checkpointRpcErrorResult(error)
  }

  return {
    ok: true,
    data: { passed: row.passed, correct: row.correct, total: row.total, minCorrect: row.min_correct },
  }
}
