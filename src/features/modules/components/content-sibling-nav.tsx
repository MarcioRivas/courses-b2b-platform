import Link from "next/link"
import { ArrowLeftIcon, ArrowRightIcon } from "lucide-react"

export interface SiblingLink {
  href: string
  title: string
}

interface ContentSiblingNavProps {
  ariaLabel: string
  prev: SiblingLink | null
  next: SiblingLink | null
  prevLabel: string
  nextLabel: string
}

/** Footer prev/next links between sibling modules (module page) or lessons (lesson page). */
export function ContentSiblingNav({ ariaLabel, prev, next, prevLabel, nextLabel }: ContentSiblingNavProps) {
  if (!prev && !next) return null

  const linkClass =
    "group flex min-w-0 flex-1 flex-col gap-0.5 rounded-xl border bg-card p-3 text-sm shadow-card transition-colors hover:border-primary/40 hover:bg-brand-soft/40 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:outline-none"

  return (
    <nav aria-label={ariaLabel} className="mt-2 flex flex-col gap-3 border-t pt-4 sm:flex-row">
      {prev ? (
        <Link href={prev.href} className={linkClass}>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            <ArrowLeftIcon aria-hidden="true" className="size-3.5" /> {prevLabel}
          </span>
          <span className="truncate font-medium">{prev.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" className="hidden flex-1 sm:block" />
      )}
      {next ? (
        <Link href={next.href} className={`${linkClass} sm:items-end sm:text-right`}>
          <span className="flex items-center gap-1 text-xs text-muted-foreground">
            {nextLabel} <ArrowRightIcon aria-hidden="true" className="size-3.5" />
          </span>
          <span className="max-w-full truncate font-medium">{next.title}</span>
        </Link>
      ) : (
        <span aria-hidden="true" className="hidden flex-1 sm:block" />
      )}
    </nav>
  )
}
