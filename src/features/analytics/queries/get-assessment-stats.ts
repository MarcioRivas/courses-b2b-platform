import { createClient } from "@/lib/supabase/server"
import { isBenignRpcError } from "../lib/rpc-error"
import type { AssessmentStatsRow } from "../types"

/** Per-assessment stats (`org_assessment_stats` RPC). */
export async function getAssessmentStats(organizationId: string): Promise<AssessmentStatsRow[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("org_assessment_stats", { p_org: organizationId })
  if (error) {
    if (isBenignRpcError(error.code)) {
      return []
    }
    throw error
  }

  return (data ?? []).map(
    (row): AssessmentStatsRow => ({
      assessmentId: row.assessment_id,
      title: row.title,
      courseId: row.course_id,
      courseTitle: row.course_title,
      kind: row.kind,
      attemptsCount: Number(row.attempts_count),
      submittedCount: Number(row.submitted_count),
      gradedCount: Number(row.graded_count),
      avgScorePercent: Number(row.avg_score_percent),
      passedCount: Number(row.passed_count),
      failedCount: Number(row.failed_count),
    })
  )
}
