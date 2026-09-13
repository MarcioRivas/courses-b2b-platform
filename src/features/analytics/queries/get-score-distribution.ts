import { createClient } from "@/lib/supabase/server"
import { sortDistributionBuckets } from "../lib/format-percent"
import { isBenignRpcError } from "../lib/rpc-error"
import type { ScoreDistributionBucket } from "../types"

/**
 * Score buckets for one assessment (`assessment_score_distribution` RPC).
 * The function resolves the org/course from the assessment row itself (D25)
 * — `null` here means the assessment doesn't exist (P0002) or the caller may
 * not see it (42501), which the page renders identically (section hidden).
 * Any other error is rethrown (M1) so the page shows `ErrorState`.
 */
export async function getScoreDistribution(assessmentId: string): Promise<ScoreDistributionBucket[] | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("assessment_score_distribution", { p_assessment: assessmentId })
  if (error) {
    if (isBenignRpcError(error.code)) {
      return null
    }
    throw error
  }

  const buckets = (data ?? []).map((row) => ({ label: row.label, count: Number(row.bucket_count) }))
  return sortDistributionBuckets(buckets)
}
