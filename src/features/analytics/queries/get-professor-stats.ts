import { createClient } from "@/lib/supabase/server"
import { isBenignRpcError } from "../lib/rpc-error"
import type { ProfessorStatsRow } from "../types"

/** Per-professor stats (`org_professor_stats` RPC). */
export async function getProfessorStats(organizationId: string): Promise<ProfessorStatsRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("org_professor_stats", { p_org: organizationId })
  if (error) {
    if (isBenignRpcError(error.code)) {
      return []
    }
    throw error
  }

  return (data ?? []).map(
    (row): ProfessorStatsRow => ({
      professorUserId: row.professor_user_id,
      firstName: row.first_name,
      lastName: row.last_name,
      assignedCoursesCount: Number(row.assigned_courses_count),
      attemptsGradedCount: Number(row.attempts_graded_count),
      lastGradedAt: row.last_graded_at,
      pendingGradingCount: Number(row.pending_grading_count),
    })
  )
}
