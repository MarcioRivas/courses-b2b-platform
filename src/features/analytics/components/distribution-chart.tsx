import { analyticsMessages } from "@/lib/messages/analytics"
import { SimpleBarChart } from "./simple-bar-chart"
import type { ScoreDistributionBucket } from "../types"

/** Score distribution for one assessment, bucketed by the org's `score_scale_ranges` (D11). */
export function DistributionChart({ buckets }: { buckets: ScoreDistributionBucket[] }) {
  if (buckets.length === 0) {
    return <p className="text-sm text-muted-foreground">{analyticsMessages.distribution.empty}</p>
  }

  return (
    <SimpleBarChart
      title={analyticsMessages.distribution.chartTitle}
      data={buckets.map((bucket) => ({ label: bucket.label, value: bucket.count }))}
    />
  )
}
