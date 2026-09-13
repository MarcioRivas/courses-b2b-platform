import Link from "next/link"
import { messages } from "@/lib/messages/es"
import { Button } from "@/components/ui/button"

interface PaginationProps {
  /** 1-based current page. */
  page: number
  pageSize: number
  total: number
  /** Builds the href for a page number, preserving the caller's other filters. */
  buildHref: (page: number) => string
}

/**
 * Link-based pager (no client JS): every admin list is a Server Component, so
 * a page change is a plain navigation that re-runs the query with a new
 * `range()`. Disabled edges render as inert buttons, never as dead anchors.
 */
export function Pagination({ page, pageSize, total, buildHref }: PaginationProps) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))

  if (total === 0) {
    return null
  }

  const from = (page - 1) * pageSize + 1
  const to = Math.min(page * pageSize, total)

  return (
    <div className="mt-4 flex flex-col items-center justify-between gap-2 sm:flex-row">
      <p className="text-sm text-muted-foreground">{messages.list.rangeLabel(from, to, total)}</p>
      <div className="flex gap-2">
        <PageLink href={buildHref(page - 1)} disabled={page <= 1} label={messages.list.previous} />
        <PageLink href={buildHref(page + 1)} disabled={page >= lastPage} label={messages.list.next} />
      </div>
    </div>
  )
}

function PageLink({ href, disabled, label }: { href: string; disabled: boolean; label: string }) {
  if (disabled) {
    return (
      <Button variant="outline" size="sm" disabled>
        {label}
      </Button>
    )
  }

  return (
    <Button variant="outline" size="sm" render={<Link href={href} />}>
      {label}
    </Button>
  )
}
