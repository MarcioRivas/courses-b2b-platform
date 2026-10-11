"use client"

import { useCallback, useMemo, useState } from "react"
import { messagingMessages as t } from "@/lib/messages/messaging"
import { useConversationMessages } from "../hooks/use-conversation-messages"
import { useConversationRealtime } from "../hooks/use-conversation-realtime"
import { useMarkConversationRead } from "../hooks/use-mark-conversation-read"
import type { ChatMessage, ConversationSummary } from "../types"
import { useMessenger } from "./messenger-provider"
import { ChatWindowHeader } from "./chat-window-header"
import { MessageComposer } from "./message-composer"
import { MessageList } from "./message-list"

interface ConversationThreadProps {
  conversation: ConversationSummary
  initialMessages: ChatMessage[]
  initialHasMore: boolean
  onMinimize: () => void
  onClose: () => void
}

/** Live conversation inside a chat window: messages, composer (read-only when the other member is inactive). */
export function ConversationThread({
  conversation,
  initialMessages,
  initialHasMore,
  onMinimize,
  onClose,
}: ConversationThreadProps) {
  const { currentUserId, timeZone, scheduleRefresh, getDraft, setDraft } = useMessenger()
  const thread = useConversationMessages(conversation.id, currentUserId, {
    messages: initialMessages,
    hasMore: initialHasMore,
  })
  // Screen readers hear only the peer's new messages, not pages of history.
  const [announcement, setAnnouncement] = useState("")

  const newestPeerAt = useMemo(
    () => thread.messages.findLast((message) => message.senderId !== currentUserId)?.createdAt ?? null,
    [thread.messages, currentUserId]
  )
  // Each mark refreshes the inbox, which clears this chat from the header badge.
  useMarkConversationRead(conversation.id, newestPeerAt, conversation.unreadCount > 0, scheduleRefresh)

  const { receive, catchUp, send } = thread
  useConversationRealtime(
    conversation.id,
    useMemo(
      () => ({
        onMessage: (message: ChatMessage) => {
          receive(message)
          if (message.senderId !== currentUserId) setAnnouncement(`${conversation.otherName}: ${message.body}`)
        },
        onSubscribed: () => void catchUp(),
      }),
      [receive, catchUp, currentUserId, conversation.otherName]
    )
  )

  const onSend = useCallback(
    async (body: string) => {
      // The inbox shows this message as the conversation's latest.
      if (await send(body)) scheduleRefresh()
    },
    [send, scheduleRefresh]
  )

  const roleLabel = conversation.otherRole ? t.roles[conversation.otherRole] : t.formerMember

  return (
    <>
      <ChatWindowHeader name={conversation.otherName} subtitle={roleLabel} onMinimize={onMinimize} onClose={onClose} />
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
      <MessageList
        messages={thread.messages}
        currentUserId={currentUserId}
        timeZone={timeZone}
        hasMore={thread.hasMore}
        loadingOlder={thread.loadingOlder}
        lastChange={thread.lastChange}
        onLoadOlder={thread.loadOlder}
        onRetry={thread.retry}
      />
      {conversation.otherIsActive ? (
        <MessageComposer
          initialValue={getDraft(conversation.id)}
          onDraftChange={(text) => setDraft(conversation.id, text)}
          onSend={onSend}
        />
      ) : (
        <p role="status" className="border-t bg-muted/60 px-4 py-3 text-sm text-muted-foreground">
          {t.thread.inactive}
        </p>
      )}
    </>
  )
}
