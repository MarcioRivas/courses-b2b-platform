import type { ReactNode } from "react"
import type { LucideIcon } from "lucide-react"
import { Breadcrumb, type BreadcrumbItem } from "./breadcrumb"

interface PageHeaderProps {
  title: string
  description?: string
  /** Small uppercase label above the title (section / role context). */
  eyebrow?: string
  icon?: LucideIcon
  /** Trail rendered above the title on detail pages. */
  breadcrumb?: BreadcrumbItem[]
  children?: ReactNode
}

export function PageHeader({ title, description, eyebrow, icon: Icon, breadcrumb, children }: PageHeaderProps) {
  return (
    <div className="mb-8 flex flex-col gap-4">
      {breadcrumb && <Breadcrumb items={breadcrumb} />}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          {Icon && (
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand-soft text-primary"
            >
              <Icon className="size-5" />
            </span>
          )}
          <div className="min-w-0">
            {eyebrow && (
              <p className="text-xs font-medium tracking-wider text-primary uppercase">{eyebrow}</p>
            )}
            <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
        </div>
        {children}
      </div>
    </div>
  )
}
