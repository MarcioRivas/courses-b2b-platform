"use client"

import { useState } from "react"
import { MessageCircleIcon } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { useMessenger } from "./messenger-provider"
import { MessengerPanel } from "./messenger-panel"
import { UnreadCountBadge } from "./unread-count-badge"

/** Header icon next to the avatar: red unread counter, opens the Chats panel. */
export function MessengerButton() {
  const { unreadCount, loadInbox, chatsButtonRef } = useMessenger()
  const [open, setOpen] = useState(false)

  function onOpenChange(next: boolean) {
    setOpen(next)
    // Opening always shows a fresh inbox (the first open is what loads it at all).
    if (next) void loadInbox()
  }

  const label = unreadCount > 0 ? `${t.panel.title} (${t.inbox.unread(unreadCount)})` : t.panel.title

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger
        render={
          <Button
            ref={chatsButtonRef}
            variant="ghost"
            size="icon"
            className="relative rounded-full bg-muted hover:bg-muted/70"
            aria-label={label}
          />
        }
      >
        <MessageCircleIcon className="size-5" />
        <UnreadCountBadge count={unreadCount} className="absolute -top-1 -right-1.5" />
      </PopoverTrigger>
      <PopoverContent align="end" className="overflow-hidden p-0">
        <MessengerPanel onDone={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  )
}
