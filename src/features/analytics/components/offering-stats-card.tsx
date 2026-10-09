import { ClipboardCheckIcon, TrendingUpIcon, UsersIcon } from "lucide-react"
import { StatsGrid } from "./stats-grid"
import { analyticsMessages } from "@/lib/messages/analytics"
import { formatPercent } from "../lib/format-percent"
import type { OfferingStatsRow } from "../types"

/** Edition Detalle tab: enrolled, average progress and pending grading for one edition. */
export function OfferingStatsCard({ stats }: { stats: OfferingStatsRow }) {
  const m = analyticsMessages.offeringDetail

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-sm font-medium">{m.sectionTitle}</h2>
      <StatsGrid
        items={[
          { key: "enrolled", label: m.enrolled, value: stats.enrolledCount, icon: UsersIcon },
          {
            key: "avgProgress",
            label: m.avgProgress,
            value: formatPercent(stats.avgProgressPercent),
            icon: TrendingUpIcon,
          },
          { key: "pending", label: m.pendingGrading, value: stats.pendingGradingCount, icon: ClipboardCheckIcon },
        ]}
      />
    </section>
  )
}
