"use client"

import { cn } from "@/lib/utils"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { formatInboxTime } from "../lib/format-message-time"
import type { ConversationSummary } from "../types"
import { MemberAvatar } from "./member-avatar"

interface ConversationListProps {
  conversations: ConversationSummary[]
  currentUserId: string
  timeZone: string
  onSelect: (conversation: ConversationSummary) => void
}

/** Inbox rows: newest first, unread ones in bold with a dot, like Messenger. */
export function ConversationList({ conversations, currentUserId, timeZone, onSelect }: ConversationListProps) {
  return (
    <ul className="flex flex-col">
      {conversations.map((conversation) => {
        const unread = conversation.unreadCount > 0
        const fromMe = conversation.lastMessageSenderId === currentUserId

        return (
          <li key={conversation.id}>
            <button
              type="button"
              onClick={() => onSelect(conversation)}
              className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
            >
              <MemberAvatar name={conversation.otherName} className="size-12" />
              <div className="min-w-0 flex-1">
                <p className={cn("truncate text-sm", unread ? "font-semibold" : "font-medium")}>
                  {conversation.otherName}
                </p>
                <p className={cn("flex gap-1 text-xs", unread ? "font-semibold text-foreground" : "text-muted-foreground")}>
                  <span className="truncate">
                    {fromMe && `${t.inbox.you} `}
                    {conversation.lastMessageBody}
                  </span>
                  {conversation.lastMessageAt && (
                    <span className="shrink-0 font-normal text-muted-foreground">
                      · {formatInboxTime(conversation.lastMessageAt, timeZone)}
                    </span>
                  )}
                </p>
              </div>
              {unread && (
                <>
                  <span aria-hidden="true" className="size-3 shrink-0 rounded-full bg-primary" />
                  <span className="sr-only">{t.inbox.unread(conversation.unreadCount)}</span>
                </>
              )}
            </button>
          </li>
        )
      })}
    </ul>
  )
}
