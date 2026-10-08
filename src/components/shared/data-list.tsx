import type { ReactNode } from "react"
import { cn } from "@/lib/utils"
import { EmptyState } from "./empty-state"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

export interface DataListColumn<T> {
  /** Stable key, also used as the React key for the cell. */
  key: string
  header: string
  cell: (item: T) => ReactNode
  /** Right-aligned action column: no header label on cards, pinned on rows. */
  isActions?: boolean
  className?: string
}

interface DataListProps<T> {
  items: T[]
  /**
   * The column identifying the row: the card heading below `md` and the first
   * table column above it. Separate from `columns` so a list can never ship a
   * desktop table whose rows have no name.
   */
  titleColumn: DataListColumn<T>
  columns: DataListColumn<T>[]
  getRowKey: (item: T) => string
  emptyTitle: string
  emptyDescription?: string
}

/**
 * Mobile-first responsive list (§44): stacked cards below `md`, a table from
 * `md` up. Shared by every admin list screen so the breakpoint behaviour is
 * defined exactly once.
 */
export function DataList<T>({
  items,
  titleColumn,
  columns,
  getRowKey,
  emptyTitle,
  emptyDescription,
}: DataListProps<T>) {
  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <>
      <ul className="flex flex-col gap-3 md:hidden">
        {items.map((item) => (
          <li key={getRowKey(item)} className="rounded-2xl border bg-card p-4 shadow-card">
            <div className="mb-2 flex items-start justify-between gap-2">
              <div className="min-w-0 text-sm font-medium">{titleColumn.cell(item)}</div>
              {columns
                .filter((column) => column.isActions)
                .map((column) => (
                  <div key={column.key} className="shrink-0">
                    {column.cell(item)}
                  </div>
                ))}
            </div>
            <dl className="flex flex-col gap-1">
              {columns
                .filter((column) => !column.isActions)
                .map((column) => (
                  <div key={column.key} className="flex items-center justify-between gap-2 text-sm">
                    <dt className="text-muted-foreground">{column.header}</dt>
                    <dd className="min-w-0 truncate text-right">{column.cell(item)}</dd>
                  </div>
                ))}
            </dl>
          </li>
        ))}
      </ul>

      <div className="hidden overflow-hidden rounded-2xl border bg-card shadow-card md:block">
        <Table>
          <TableHeader className="bg-muted/50 text-xs tracking-wider uppercase">
            <TableRow>
              {[titleColumn, ...columns].map((column) => (
                <TableHead
                  key={column.key}
                  className={cn("h-11 px-4 first:pl-6 last:pr-6", column.isActions && "text-right", column.className)}
                >
                  {column.isActions ? <span className="sr-only">{column.header}</span> : column.header}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={getRowKey(item)} className="hover:bg-muted/60">
                {[titleColumn, ...columns].map((column) => (
                  <TableCell
                    key={column.key}
                    className={cn("px-4 py-3 first:pl-6 last:pr-6", column.isActions && "text-right", column.className)}
                  >
                    {column.cell(item)}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  )
}
