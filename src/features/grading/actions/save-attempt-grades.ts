"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { saveAttemptGradesSchema, type SaveAttemptGradesInput } from "../schemas/grading-schemas"
import type { SaveAttemptGradesResult } from "../types"

/**
 * The single "Guardar" of the grading screen: every open-answer grade plus the
 * overall feedback in ONE transaction (`grade_attempt_batch`), which validates
 * ownership, question type and the 0..max range per row.
 */
export async function saveAttemptGrades(input: SaveAttemptGradesInput): Promise<ActionResult<SaveAttemptGradesResult>> {
  const parsed = saveAttemptGradesSchema.safeParse(input)
  if (!parsed.success) {
    return {
      ok: false,
      code: "VALIDATION",
      message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION,
    }
  }

  await requireOrgRole(["PROFESSOR"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("grade_attempt_batch", {
    p_attempt: parsed.data.attemptId,
    p_grades: parsed.data.grades.map((g) => ({
      attempt_question_id: g.attemptQuestionId,
      points: g.points,
      feedback: g.feedback || null,
    })),
    p_feedback: parsed.data.feedback,
  })

  if (error) {
    if (error.message.includes("ATTEMPT_IN_PROGRESS")) {
      return { ok: false, code: "VALIDATION", message: teachGradingMessages.errors.attemptInProgress }
    }
    // The client already checks ranges and feedback, so reaching this means stale or tampered
    // input; the RPC raises one code for all row problems, hence a generic message.
    if (error.message.includes("INVALID_ANSWER")) {
      return { ok: false, code: "VALIDATION", message: teachGradingMessages.errors.invalidGrades }
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
      maxScore: row.max_score,
      scorePercent: row.score_percent,
      scoreLabel: row.score_label,
      passed: row.passed,
      ungradedCount: row.ungraded_count,
    },
  }
}
