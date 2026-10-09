import { createClient } from "@/lib/supabase/server"
import { isBenignRpcError } from "../lib/rpc-error"
import type { OfferingStatsRow } from "../types"

/** Per-edition stats (`org_offering_stats` RPC), optionally limited to one course. */
export async function getOfferingStats(organizationId: string, courseId?: string | null): Promise<OfferingStatsRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("org_offering_stats", {
    p_org: organizationId,
    ...(courseId ? { p_course: courseId } : {}),
  })
  if (error) {
    if (isBenignRpcError(error.code)) {
      return []
    }
    throw error
  }

  return (data ?? []).map(
    (row): OfferingStatsRow => ({
      offeringId: row.offering_id,
      offeringName: row.offering_name,
      courseId: row.course_id,
      courseTitle: row.course_title,
      groupName: row.group_name,
      enrolledCount: Number(row.enrolled_count),
      avgProgressPercent: Number(row.avg_progress_percent),
      attemptsCount: Number(row.attempts_count),
      pendingGradingCount: Number(row.pending_grading_count),
    })
  )
}
