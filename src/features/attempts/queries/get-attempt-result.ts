import { createClient } from "@/lib/supabase/server"
import type { AttemptResultRow } from "../types"

/**
 * Resolved score/label/feedback of ONE attempt via `attempt_result` — the
 * student-safe read that needs no enrollment id. Every field is NULL unless
 * the attempt is GRADED (D24/F7), so a SUBMITTED attempt reveals nothing.
 */
export async function getAttemptResult(attemptId: string): Promise<AttemptResultRow | null> {
  const supabase = await createClient()

  const { data } = await supabase.rpc("attempt_result", { p_attempt: attemptId })
  const row = data?.[0]
  if (!row) {
    return null
  }

  return {
    scorePercent: row.score_percent === null ? null : Number(row.score_percent),
    scoreLabel: row.score_label,
    passed: row.passed,
    overallFeedback: row.overall_feedback,
  }
}
