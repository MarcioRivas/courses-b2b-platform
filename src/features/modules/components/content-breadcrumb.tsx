import { Fragment } from "react"
import Link from "next/link"
import { ChevronRightIcon } from "lucide-react"
import { contentMessages } from "@/lib/messages/admin-content"

export interface BreadcrumbItem {
  label: string
  /** Omitted on the last (current) item. */
  href?: string
}

/**
 * `Cursos › {curso} › {módulo} › {lección}` trail for the drill-down builder.
 * Items wrap on narrow screens; each label is clamped so a long course title
 * never forces horizontal scroll at 375px.
 */
export function ContentBreadcrumb({ items }: { items: BreadcrumbItem[] }) {
  return (
    <nav aria-label={contentMessages.builder.breadcrumbLabel}>
      <ol className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-sm text-muted-foreground">
        {items.map((item, index) => {
          const isLast = index === items.length - 1
          return (
            <Fragment key={`${item.label}-${index}`}>
              {index > 0 && <ChevronRightIcon aria-hidden="true" className="size-3.5 shrink-0 opacity-60" />}
              <li className="min-w-0">
                {item.href && !isLast ? (
                  <Link
                    href={item.href}
                    className="block max-w-[14rem] truncate rounded-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none sm:max-w-xs"
                  >
                    {item.label}
                  </Link>
                ) : (
                  <span
                    aria-current={isLast ? "page" : undefined}
                    className="block max-w-[14rem] truncate font-medium text-foreground sm:max-w-xs"
                  >
                    {item.label}
                  </span>
                )}
              </li>
            </Fragment>
          )
        })}
      </ol>
    </nav>
  )
}
