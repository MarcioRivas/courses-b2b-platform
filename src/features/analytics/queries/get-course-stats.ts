import { createClient } from "@/lib/supabase/server"
import { isBenignRpcError } from "../lib/rpc-error"
import type { CourseStatsRow } from "../types"

/** Per-course stats (`org_course_stats` RPC) — no separate per-course analytics page (D34). */
export async function getCourseStats(organizationId: string): Promise<CourseStatsRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("org_course_stats", { p_org: organizationId })
  if (error) {
    if (isBenignRpcError(error.code)) {
      return []
    }
    throw error
  }

  return (data ?? []).map(
    (row): CourseStatsRow => ({
      courseId: row.course_id,
      courseTitle: row.course_title,
      status: row.status,
      offeringsCount: Number(row.offerings_count),
      enrolledCount: Number(row.enrolled_count),
      avgProgressPercent: Number(row.avg_progress_percent),
      completionRate: Number(row.completion_rate),
      lastActivity: row.last_activity,
    })
  )
}
