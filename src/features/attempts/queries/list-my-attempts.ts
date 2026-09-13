import { createClient } from "@/lib/supabase/server"
import type { MyAttemptRow } from "../types"

/**
 * Every assessment of one enrollment, with attempt/score data revealed only
 * when GRADED (D24/F7). Feeds the "Evaluaciones" course section and the
 * `/learn` "Pendientes / Resultados" strip.
 */
export async function listMyAttempts(enrollmentId: string): Promise<MyAttemptRow[]> {
  const supabase = await createClient()

  const { data } = await supabase.rpc("list_my_attempts", { p_enrollment: enrollmentId })

  return (data ?? []).map(
    (row): MyAttemptRow => ({
      assessmentId: row.assessment_id,
      title: row.title,
      kind: row.kind,
      availableFrom: row.available_from,
      availableUntil: row.available_until,
      durationSeconds: row.duration_seconds,
      maxAttempts: row.max_attempts,
      passingScore: row.passing_score,
      attemptsUsed: row.attempts_used,
      lastAttemptId: row.last_attempt_id,
      lastStatus: row.last_status,
      scorePercent: row.score_percent === null ? null : Number(row.score_percent),
      scoreLabel: row.score_label,
      passed: row.passed,
      overallFeedback: row.overall_feedback,
    })
  )
}
