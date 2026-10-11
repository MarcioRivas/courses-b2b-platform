"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { toast } from "sonner"
import { sendMessage } from "../actions/send-message"
import { fetchMessages } from "../lib/messaging-reads"
import { settleAction as settle } from "../lib/settle-action"
import type { ChatMessage } from "../types"

/** A message in the thread; local ones carry a send status until the server confirms them. */
export interface ThreadMessage extends ChatMessage {
  status?: "sending" | "failed"
}

/** What last changed, so the list knows whether to stick to the bottom or keep its scroll offset. */
export type ThreadChange = "initial" | "appended" | "prepended"

/** Start of time, for catching up on a thread that had no messages yet. */
const EMPTY_CURSOR = { createdAt: "1970-01-01T00:00:00Z", id: "00000000-0000-0000-0000-000000000000" }

/** Server order: created_at, then id (the index order). */
function byPosition(a: ThreadMessage, b: ThreadMessage) {
  return a.createdAt === b.createdAt ? a.id.localeCompare(b.id) : Date.parse(a.createdAt) - Date.parse(b.createdAt)
}

/**
 * Client state of an open thread: the server's first page, older pages on
 * demand, optimistic sends (retry is idempotent: the id is generated here and
 * the RPC dedupes on it), messages pushed by Realtime, and a catch-up fetch on
 * every (re)subscribe for anything committed while the socket was not joined.
 */
export function useConversationMessages(
  conversationId: string,
  currentUserId: string,
  initial: { messages: ChatMessage[]; hasMore: boolean }
) {
  const [messages, setMessages] = useState<ThreadMessage[]>(initial.messages)
  const [hasMore, setHasMore] = useState(initial.hasMore)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const [lastChange, setLastChange] = useState<ThreadChange>("initial")

  // Callbacks read the latest list without being recreated on every message.
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  /** Adds server messages not already present (by id) and keeps server order. */
  const merge = useCallback((incoming: ChatMessage[], change: ThreadChange) => {
    setMessages((current) => {
      const known = new Set(current.map((message) => message.id))
      const added = incoming.filter((message) => !known.has(message.id))
      return added.length === 0 ? current : [...current, ...added].sort(byPosition)
    })
    setLastChange(change)
  }, [])

  const deliver = useCallback(
    async (id: string, body: string) => {
      const result = await settle(() => sendMessage({ conversationId, clientId: id, body }))
      setMessages((current) =>
        current
          .map((message) =>
            message.id !== id ? message : result.ok ? result.data : { ...message, status: "failed" as const }
          )
          // The server timestamp replaces the client's clock: re-sort.
          .sort(byPosition)
      )
      if (!result.ok) toast.error(result.message)
      return result.ok
    },
    [conversationId]
  )

  const send = useCallback(
    (body: string) => {
      const id = crypto.randomUUID()
      setMessages((current) => [
        ...current,
        { id, conversationId, senderId: currentUserId, body, createdAt: new Date().toISOString(), status: "sending" },
      ])
      setLastChange("appended")
      return deliver(id, body)
    },
    [conversationId, currentUserId, deliver]
  )

  const retry = useCallback(
    (id: string) => {
      const message = messagesRef.current.find((item) => item.id === id)
      if (!message) return
      setMessages((current) => current.map((item) => (item.id === id ? { ...item, status: "sending" } : item)))
      void deliver(id, message.body)
    },
    [deliver]
  )

  /** A message pushed by Realtime. The sender's own copies come back from the action instead. */
  const receive = useCallback(
    (message: ChatMessage) => {
      if (message.senderId !== currentUserId) merge([message], "appended")
    },
    [currentUserId, merge]
  )

  /** Everything since the newest confirmed message: run on each Realtime (re)join. */
  const catchUp = useCallback(async () => {
    const newest = messagesRef.current.findLast((message) => !message.status)
    const cursor = newest ? { createdAt: newest.createdAt, id: newest.id } : EMPTY_CURSOR
    const result = await settle(() => fetchMessages(conversationId, "newer", cursor))
    if (result.ok && result.data.messages.length > 0) merge(result.data.messages, "appended")
  }, [conversationId, merge])

  const loadOlder = useCallback(async () => {
    const oldest = messagesRef.current.find((message) => !message.status)
    if (!oldest || loadingOlder) return

    setLoadingOlder(true)
    try {
      const result = await settle(() =>
        fetchMessages(conversationId, "older", { createdAt: oldest.createdAt, id: oldest.id })
      )
      if (!result.ok) {
        toast.error(result.message)
        return
      }
      setMessages((current) => [...result.data.messages, ...current])
      setHasMore(result.data.hasMore)
      setLastChange("prepended")
    } finally {
      setLoadingOlder(false)
    }
  }, [conversationId, loadingOlder])

  return { messages, hasMore, loadingOlder, lastChange, send, retry, receive, catchUp, loadOlder }
}
