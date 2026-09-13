import type { LucideIcon } from "lucide-react"
import { StatCard } from "@/components/shared/stat-card"

export interface StatsGridItem {
  key: string
  label: string
  value: number | string
  icon?: LucideIcon
}

/** Responsive grid of `StatCard`s shared by every analytics section. */
export function StatsGrid({ items }: { items: StatsGridItem[] }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <StatCard key={item.key} label={item.label} value={item.value} icon={item.icon} />
      ))}
    </div>
  )
}
