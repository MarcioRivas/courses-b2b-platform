import type { AppNotification } from "../types"

export interface NotificationList {
  items: AppNotification[]
  hasMore: boolean
}

/** Same order as my_notifications: (updatedAt, id) descending. */
function isOlder(item: AppNotification, than: AppNotification): boolean {
  if (item.updatedAt !== than.updatedAt) return item.updatedAt < than.updatedAt
  return item.id < than.id
}

/**
 * Puts a freshly fetched page 1 over the current list. Rows past page 1 that
 * were loaded with "Ver más" are kept (minus any that moved into page 1), so a
 * refresh caused by a new or bumped notification does not collapse the list.
 * When page 1 is the whole list, it simply replaces it.
 */
export function mergeFirstPage(current: NotificationList | null, firstPage: NotificationList): NotificationList {
  const boundary = firstPage.items.at(-1)
  if (!current || !boundary || !firstPage.hasMore) return firstPage

  const fresh = new Set(firstPage.items.map((item) => item.id))
  const older = current.items.filter((item) => !fresh.has(item.id) && isOlder(item, boundary))
  if (older.length === 0) return firstPage

  return { items: [...firstPage.items, ...older], hasMore: current.hasMore }
}
