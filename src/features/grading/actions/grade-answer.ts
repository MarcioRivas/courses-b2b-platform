"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { gradeAnswerSchema, type GradeAnswerInput } from "../schemas/grading-schemas"
import type { GradeAnswerResult } from "../types"

/**
 * Grades one OPEN_ENDED answer (B12/D15) via `grade_open_answer`, which
 * re-validates ownership, question type and the 0..max range server-side —
 * the read here only turns an out-of-range value into a friendly Spanish
 * message before the round trip, since the RPC's own error is a bare code.
 */
export async function gradeAnswer(input: GradeAnswerInput): Promise<ActionResult<GradeAnswerResult>> {
  const parsed = gradeAnswerSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  await requireOrgRole(["PROFESSOR"])
  const supabase = await createClient()

  const { data: question, error: questionError } = await supabase
    .from("assessment_attempt_questions")
    .select("points")
    .eq("id", parsed.data.attemptQuestionId)
    .eq("attempt_id", parsed.data.attemptId)
    .maybeSingle()

  if (questionError || !question) {
    return { ok: false, code: "NOT_FOUND", message: messages.errors.NOT_FOUND }
  }

  if (parsed.data.points > question.points) {
    return { ok: false, code: "VALIDATION", message: teachGradingMessages.errors.pointsAboveMax }
  }

  const { data, error } = await supabase.rpc("grade_open_answer", {
    p_attempt: parsed.data.attemptId,
    p_attempt_question: parsed.data.attemptQuestionId,
    p_points: parsed.data.points,
    p_feedback: parsed.data.feedback || undefined,
  })

  if (error) {
    if (error.message.includes("ATTEMPT_IN_PROGRESS")) {
      return { ok: false, code: "VALIDATION", message: teachGradingMessages.errors.attemptInProgress }
    }
    if (error.message.includes("INVALID_ANSWER")) {
      return { ok: false, code: "VALIDATION", message: teachGradingMessages.errors.pointsAboveMax }
    }
    return { ok: false, ...toActionError(error) }
  }

  const row = data?.[0]
  if (!row) {
    return { ok: false, code: "INTERNAL", message: messages.errors.INTERNAL }
  }

  revalidatePath(`/teach/grading/${parsed.data.attemptId}`)
  revalidatePath("/teach/grading")

  return {
    ok: true,
    data: {
      status: row.status,
      totalScore: row.total_score,
      scorePercent: row.score_percent,
      scoreLabel: row.score_label,
    },
  }
}
