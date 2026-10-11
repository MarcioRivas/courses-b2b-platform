"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { fetchInbox, fetchUnreadCount } from "../lib/messaging-reads"
import { subscribeToNewMessages } from "../lib/subscribe-to-new-messages"
import type { ConversationSummary } from "../types"

/** Coalesces a burst of incoming messages / reads into one fetch. */
const REFRESH_DEBOUNCE_MS = 400

/**
 * The header inbox. Until the Chats panel is first opened only the unread
 * total is kept fresh (one cheap RPC), so a page load never pulls the whole
 * inbox; once opened, the conversation list is kept fresh too. Realtime pushes
 * only messages addressed to this user (`recipient_id` filter + RLS); each one,
 * and each (re)join of the channel, schedules a refresh. The badge starts
 * from the server's count so the first paint is right.
 */
export function useMessengerInbox(userId: string, initialUnread: number) {
  const [conversations, setConversations] = useState<ConversationSummary[] | null>(null)
  const [unreadCount, setUnreadCount] = useState(initialUnread)
  const [failed, setFailed] = useState(false)
  const inboxLoaded = useRef(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  const loadInbox = useCallback(async () => {
    clearTimeout(timer.current)
    const result = await fetchInbox()
    if (!result.ok) {
      setFailed(true)
      return
    }
    inboxLoaded.current = true
    setFailed(false)
    setConversations(result.data)
    setUnreadCount(result.data.reduce((total, conversation) => total + conversation.unreadCount, 0))
  }, [])

  const refresh = useCallback(async () => {
    if (inboxLoaded.current) {
      await loadInbox()
      return
    }
    const result = await fetchUnreadCount()
    if (result.ok) setUnreadCount(result.data)
  }, [loadInbox])

  const scheduleRefresh = useCallback(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => void refresh(), REFRESH_DEBOUNCE_MS)
  }, [refresh])

  useEffect(() => {
    let joinedOnce = false
    const unsubscribe = subscribeToNewMessages(`inbox:${userId}`, {
      filter: `recipient_id=eq.${userId}`,
      onMessage: scheduleRefresh,
      // The server already counted on first paint; a REjoin catches up on anything missed offline.
      onSubscribed: () => {
        if (joinedOnce) scheduleRefresh()
        joinedOnce = true
      },
    })
    return () => {
      clearTimeout(timer.current)
      unsubscribe()
    }
  }, [userId, scheduleRefresh])

  return { conversations, unreadCount, failed, loadInbox, scheduleRefresh }
}
