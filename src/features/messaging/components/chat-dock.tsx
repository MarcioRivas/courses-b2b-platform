"use client"

import { XIcon } from "lucide-react"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { useIsDesktop } from "../hooks/use-is-desktop"
import { useMessenger } from "./messenger-provider"
import { ChatWindow } from "./chat-window"
import { MemberAvatar } from "./member-avatar"
import { UnreadCountBadge } from "./unread-count-badge"

/**
 * Bottom-right dock. Desktop: up to two windows side by side plus a column of
 * minimized avatar bubbles. Mobile: only the newest window is mounted (full
 * screen), so a chat the user cannot see never marks messages read.
 */
export function ChatDock() {
  const { openChats, minimizedChats, conversations, openChat, minimizeChat, closeChat, chatsButtonRef } = useMessenger()
  const isDesktop = useIsDesktop()

  if (openChats.length === 0 && minimizedChats.length === 0) return null

  const unreadOf = (id: string) => conversations?.find((conversation) => conversation.id === id)?.unreadCount ?? 0
  const shown = isDesktop ? openChats : openChats.slice(-1)
  // The window and its buttons disappear: put focus somewhere predictable.
  const focusChats = () => requestAnimationFrame(() => chatsButtonRef.current?.focus())

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex items-end justify-end gap-3 md:right-4 md:left-auto">
      {shown.map((chat) => (
        <div key={chat.id} className="pointer-events-auto fixed inset-0 z-50 md:static md:inset-auto">
          <ChatWindow
            chat={chat}
            isDesktop={isDesktop}
            onMinimize={() => {
              minimizeChat(chat.id)
              focusChats()
            }}
            onClose={() => {
              closeChat(chat.id)
              focusChats()
            }}
          />
        </div>
      ))}
      {isDesktop && minimizedChats.length > 0 && (
        <ul aria-label={t.dock.minimized} className="pointer-events-auto mb-4 flex flex-col-reverse gap-3">
          {minimizedChats.map((chat) => {
            const unread = unreadOf(chat.id)
            return (
              <li key={chat.id} className="group relative animate-rise-in">
                <button
                  type="button"
                  onClick={() => openChat(chat)}
                  aria-label={unread > 0 ? `${t.dock.open(chat.name)}, ${t.inbox.unread(unread)}` : t.dock.open(chat.name)}
                  title={chat.name}
                  className="relative block rounded-full shadow-lg ring-2 ring-background transition-transform hover:scale-105 focus-visible:outline-2 focus-visible:outline-ring"
                >
                  <MemberAvatar name={chat.name} className="size-12" />
                  <UnreadCountBadge count={unread} className="absolute -top-1 -right-1" />
                </button>
                <button
                  type="button"
                  onClick={() => {
                    closeChat(chat.id)
                    focusChats()
                  }}
                  aria-label={t.dock.close(chat.name)}
                  className="absolute -top-1 -left-1 grid size-5 place-items-center rounded-full bg-background text-muted-foreground opacity-0 shadow ring-1 ring-border transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
                >
                  <XIcon className="size-3" />
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
