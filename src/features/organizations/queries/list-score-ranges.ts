import { createClient } from "@/lib/supabase/server"
import type { ScoreRange } from "../types"

/** RLS-scoped read, ordered by `min_score` desc (D34: no `sort_order` column). */
export async function listScoreRanges(organizationId: string): Promise<ScoreRange[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("score_scale_ranges")
    .select("id, organization_id, label, min_score, max_score, is_passing")
    .eq("organization_id", organizationId)
    .order("min_score", { ascending: false })

  if (error) {
    return []
  }

  return (data ?? []).map((range) => ({
    id: range.id,
    organizationId: range.organization_id,
    label: range.label,
    minScore: range.min_score,
    maxScore: range.max_score,
    isPassing: range.is_passing,
  }))
}
