"use client"

import { useEffect, useRef } from "react"
import { subscribeToNewMessages } from "../lib/subscribe-to-new-messages"
import type { ChatMessage } from "../types"

interface ConversationRealtimeHandlers {
  onMessage: (message: ChatMessage) => void
  /** Each (re)join: fetch what was committed while not subscribed. */
  onSubscribed: () => void
}

/** Pushes new messages of one conversation while mounted. */
export function useConversationRealtime(conversationId: string, handlers: ConversationRealtimeHandlers) {
  // Latest handlers without resubscribing on every render.
  const handlersRef = useRef(handlers)
  useEffect(() => {
    handlersRef.current = handlers
  }, [handlers])

  useEffect(
    () =>
      subscribeToNewMessages(`conversation:${conversationId}`, {
        filter: `conversation_id=eq.${conversationId}`,
        onMessage: (message) => handlersRef.current.onMessage(message),
        onSubscribed: () => handlersRef.current.onSubscribed(),
      }),
    [conversationId]
  )
}
