"use client"

import { useState } from "react"
import { BellIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { PopoverTitle } from "@/components/ui/popover"
import { notificationsMessages as t } from "@/lib/messages/notifications"
import type { AppNotification } from "../types"
import { NotificationItem } from "./notification-item"

interface NotificationsPanelProps {
  items: AppNotification[] | null
  hasMore: boolean
  unreadCount: number
  failed: boolean
  timeZone: string
  onRetry: () => void
  onLoadMore: () => Promise<void>
  onOpen: (notification: AppNotification) => void
  onMarkAll: () => void
}

/** Bell dropdown: title + "mark all", newest first, "Ver más" for older pages. */
export function NotificationsPanel({
  items,
  hasMore,
  unreadCount,
  failed,
  timeZone,
  onRetry,
  onLoadMore,
  onOpen,
  onMarkAll,
}: NotificationsPanelProps) {
  const [loadingMore, setLoadingMore] = useState(false)

  async function loadMore() {
    setLoadingMore(true)
    await onLoadMore()
    setLoadingMore(false)
  }

  const body =
    items === null ? (
      failed ? (
        <div className="flex flex-col items-start gap-2 px-2 py-3">
          <p className="text-sm text-muted-foreground">{t.panel.failed}</p>
          <Button variant="outline" size="sm" onClick={onRetry}>
            {t.panel.retry}
          </Button>
        </div>
      ) : (
        <p className="px-2 py-3 text-sm text-muted-foreground">{t.panel.loading}</p>
      )
    ) : items.length === 0 ? (
      <div className="flex flex-col items-center gap-2 px-4 py-8 text-center">
        <BellIcon aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">{t.panel.empty}</p>
      </div>
    ) : (
      <>
        <ul className="flex flex-col">
          {items.map((notification) => (
            <NotificationItem key={notification.id} notification={notification} timeZone={timeZone} onOpen={onOpen} />
          ))}
        </ul>
        {hasMore && (
          <Button variant="ghost" size="sm" className="mt-1 w-full" disabled={loadingMore} onClick={() => void loadMore()}>
            {t.panel.loadMore}
          </Button>
        )}
      </>
    )

  return (
    <div className="flex max-h-[min(38rem,calc(100dvh-5rem))] w-[min(22.5rem,calc(100vw-1rem))] flex-col">
      <div className="flex items-center justify-between gap-2 px-4 pt-4 pb-2">
        <PopoverTitle className="text-2xl font-bold tracking-tight">{t.button.title}</PopoverTitle>
        {unreadCount > 0 && (
          <Button variant="link" size="sm" className="h-auto px-0" onClick={onMarkAll}>
            {t.panel.markAll}
          </Button>
        )}
      </div>
      <div className="min-h-40 flex-1 overflow-y-auto px-2 pb-2">{body}</div>
    </div>
  )
}
