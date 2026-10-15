"use client"

import { useState } from "react"
import { BellIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { notificationsMessages as t } from "@/lib/messages/notifications"
import { UnreadCountBadge } from "@/features/messaging/components/unread-count-badge"
import { useNotificationsInbox } from "../hooks/use-notifications-inbox"
import type { AppNotification } from "../types"
import { NotificationsPanel } from "./notifications-panel"

interface NotificationsButtonProps {
  currentUserId: string
  initialUnread: number
  /** Org timezone (C16) for dates in the copy. */
  timeZone: string
}

/** Header bell next to Chats: red unread counter, opens the notifications panel. */
export function NotificationsButton({ currentUserId, initialUnread, timeZone }: NotificationsButtonProps) {
  const inbox = useNotificationsInbox(currentUserId, initialUnread)
  const [open, setOpen] = useState(false)

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Opening always shows a fresh list (the first open is what loads it at all).
    if (next) void inbox.load()
  }

  function openNotification(notification: AppNotification) {
    inbox.markRead(notification)
    setOpen(false)
  }

  const label = inbox.unreadCount > 0 ? `${t.button.title} (${t.button.unread(inbox.unreadCount)})` : t.button.title

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            variant="ghost"
            size="icon"
            className="relative rounded-full bg-muted hover:bg-muted/70"
            aria-label={label}
          />
        }
      >
        <BellIcon className="size-5" />
        <UnreadCountBadge count={inbox.unreadCount} className="absolute -top-1 -right-1.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="overflow-hidden p-0">
        <NotificationsPanel
          items={inbox.items}
          hasMore={inbox.hasMore}
          unreadCount={inbox.unreadCount}
          failed={inbox.failed}
          timeZone={timeZone}
          onRetry={() => void inbox.load()}
          onLoadMore={inbox.loadMore}
          onOpen={openNotification}
          onMarkAll={inbox.markAllRead}
        />
      </PopoverContent>
    </Popover>
  )
}
