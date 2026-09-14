import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { ContentBreadcrumb, type BreadcrumbItem } from "./content-breadcrumb"

interface ContentPageHeaderProps {
  breadcrumb: BreadcrumbItem[]
  eyebrow?: string
  title: string
  description?: string | null
  icon?: LucideIcon
  /** Chips next to the title (status, dependencies…). */
  badges?: ReactNode
  /** Right-aligned actions (edit, dependencies, primary create button). Wrap under `sm`. */
  actions?: ReactNode
}

/**
 * Top of every builder level: breadcrumb → eyebrow → h1 + badges → description,
 * with actions to the right on `sm+` and stacked below on mobile.
 */
export function ContentPageHeader({
  breadcrumb,
  eyebrow,
  title,
  description,
  icon: Icon,
  badges,
  actions,
}: ContentPageHeaderProps) {
  return (
    <header className="flex flex-col gap-4">
      <ContentBreadcrumb items={breadcrumb} />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          {Icon && (
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-primary"
            >
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && <p className="text-xs font-medium tracking-wider text-primary uppercase">{eyebrow}</p>}
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h1 className="text-2xl font-semibold tracking-tight break-words md:text-3xl">{title}</h1>
              {badges}
            </div>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>

        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  )
}
