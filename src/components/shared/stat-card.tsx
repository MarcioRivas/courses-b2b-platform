import type { LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"

type StatTone = "brand" | "secondary" | "success" | "muted"

interface StatCardProps {
  label: string
  value: number | string
  icon?: LucideIcon
  tone?: StatTone
}

const TONE: Record<StatTone, string> = {
  brand: "bg-brand-soft text-primary",
  secondary: "bg-warning-soft text-secondary-foreground",
  success: "bg-success-soft text-success",
  muted: "bg-muted text-muted-foreground",
}

/** Single metric tile used by the admin and platform dashboards. */
export function StatCard({ label, value, icon: Icon, tone = "brand" }: StatCardProps) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-2xl border bg-card p-5 shadow-card">
      <div className="min-w-0">
        <p className="truncate text-sm text-muted-foreground">{label}</p>
        <p className="text-3xl font-semibold tabular-nums">{value}</p>
      </div>
      {Icon && (
        <span
          aria-hidden="true"
          className={cn("grid size-10 shrink-0 place-items-center rounded-xl", TONE[tone])}
        >
          <Icon className="size-5" />
        </span>
      )}
    </div>
  )
}
