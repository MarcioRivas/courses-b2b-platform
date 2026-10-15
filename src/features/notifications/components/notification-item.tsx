"use client"

import Link from "next/link"
import { cn } from "@/lib/utils"
import { notificationsMessages as t } from "@/lib/messages/notifications"
import { formatInboxTime } from "@/features/messaging/lib/format-message-time"
import { presentNotification } from "../lib/notification-presentation"
import type { AppNotification } from "../types"

interface NotificationItemProps {
  notification: AppNotification
  timeZone: string
  onOpen: (notification: AppNotification) => void
}

/** One bell row: unread rows in bold with a dot. Clicking marks it read and navigates. */
export function NotificationItem({ notification, timeZone, onOpen }: NotificationItemProps) {
  const view = presentNotification(notification, timeZone)
  const unread = notification.readAt === null

  return (
    <li>
      <Link
        href={view.href}
        onClick={() => onOpen(notification)}
        className="flex w-full items-start gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
      >
        <div className="min-w-0 flex-1">
          <p className={cn("text-sm", unread ? "font-semibold" : "font-medium")}>{view.title}</p>
          <p className={cn("text-xs", unread ? "text-foreground" : "text-muted-foreground")}>{view.body}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{formatInboxTime(notification.updatedAt, timeZone)}</p>
        </div>
        {unread && (
          <>
            <span aria-hidden="true" className="mt-1.5 size-2.5 shrink-0 rounded-full bg-primary" />
            <span className="sr-only">{t.panel.unreadDot}</span>
          </>
        )}
      </Link>
    </li>
  )
}
