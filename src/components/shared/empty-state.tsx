import type { ReactNode } from "react"
import { InboxIcon, type LucideIcon } from "lucide-react"

interface EmptyStateProps {
  title: string
  description?: string
  icon?: LucideIcon
  /** Optional CTA (e.g. the "create" dialog trigger) rendered under the copy. */
  action?: ReactNode
}

export function EmptyState({ title, description, icon: Icon = InboxIcon, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed bg-card/60 p-10 text-center">
      <span
        aria-hidden="true"
        className="grid size-12 place-items-center rounded-2xl bg-brand-soft text-primary"
      >
        <Icon className="size-6" />
      </span>
      <div className="flex flex-col gap-1">
        <p className="text-base font-medium">{title}</p>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {action && <div className="mt-1">{action}</div>}
    </div>
  )
}
