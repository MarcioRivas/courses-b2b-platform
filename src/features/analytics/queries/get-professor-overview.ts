import { createClient } from "@/lib/supabase/server"
import { isBenignRpcError } from "../lib/rpc-error"
import type { ProfessorOverviewRow } from "../types"

/**
 * The professor's own courses only (`professor_overview_stats` RPC, no
 * `p_org` argument — scoped to the editions in `auth.uid()`s `offering_professors` rows).
 * Never returns org-wide numbers (B12).
 */
export async function getProfessorOverview(): Promise<ProfessorOverviewRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("professor_overview_stats")
  if (error) {
    if (isBenignRpcError(error.code)) {
      return []
    }
    throw error
  }

  return (data ?? []).map(
    (row): ProfessorOverviewRow => ({
      courseId: row.course_id,
      courseTitle: row.course_title,
      enrolledCount: Number(row.enrolled_count),
      avgProgressPercent: Number(row.avg_progress_percent),
      attemptsInProgress: Number(row.attempts_in_progress),
      attemptsSubmitted: Number(row.attempts_submitted),
      attemptsAutoSubmitted: Number(row.attempts_auto_submitted),
      attemptsGraded: Number(row.attempts_graded),
      pendingGradingCount: Number(row.pending_grading_count),
    })
  )
}
