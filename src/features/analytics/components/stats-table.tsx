import { DataList, type DataListColumn } from "@/components/shared/data-list"

interface StatsTableProps<T> {
  items: T[]
  titleColumn: DataListColumn<T>
  columns: DataListColumn<T>[]
  getRowKey: (item: T) => string
  emptyTitle: string
  emptyDescription?: string
}

/**
 * `DataList` wrapped in its own `overflow-x-auto` box: a wide rollup table
 * (platform per-org table has 7+ columns) scrolls itself, never the page —
 * mobile still gets `DataList`'s stacked cards, which never overflow.
 */
export function StatsTable<T>(props: StatsTableProps<T>) {
  return (
    <div className="overflow-x-auto">
      <DataList {...props} />
    </div>
  )
}
