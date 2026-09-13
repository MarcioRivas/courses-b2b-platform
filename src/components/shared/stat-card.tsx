import type { LucideIcon } from "lucide-react"

interface StatCardProps {
  label: string
  value: number | string
  icon?: LucideIcon
}

/** Single metric tile used by the admin and platform dashboards. */
export function StatCard({ label, value, icon: Icon }: StatCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border bg-card p-4">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </div>
      {Icon && <Icon className="size-5 shrink-0 text-muted-foreground" />}
    </div>
  )
}
