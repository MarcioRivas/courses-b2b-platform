"use client"

import { useCallback, useEffect, useRef } from "react"
import { markConversationRead } from "../actions/mark-conversation-read"

/**
 * Keeps the server's read marker at the newest peer message actually shown,
 * only while the tab is visible (a thread left open in a background tab is
 * marked when the user comes back). `onMarked` runs after each successful mark
 * (the caller refreshes the inbox / header badge).
 */
export function useMarkConversationRead(
  conversationId: string,
  newestPeerAt: string | null,
  initiallyUnread: boolean,
  onMarked: () => void
) {
  // Nothing to mark on open when the server says the thread is already read.
  const lastMarked = useRef<string | null>(initiallyUnread ? null : newestPeerAt)
  const newestRef = useRef(newestPeerAt)
  useEffect(() => {
    newestRef.current = newestPeerAt
  }, [newestPeerAt])

  const markUpToNewest = useCallback(async () => {
    const upTo = newestRef.current
    if (!upTo || document.visibilityState !== "visible") return
    const last = lastMarked.current
    if (last && (upTo === last || Date.parse(upTo) < Date.parse(last))) return

    lastMarked.current = upTo
    try {
      const result = await markConversationRead({ conversationId, upTo })
      if (result.ok) onMarked()
      else lastMarked.current = last
    } catch {
      lastMarked.current = last
    }
  }, [conversationId, onMarked])

  useEffect(() => {
    void markUpToNewest()
  }, [newestPeerAt, markUpToNewest])

  useEffect(() => {
    const onVisible = () => void markUpToNewest()
    document.addEventListener("visibilitychange", onVisible)
    return () => document.removeEventListener("visibilitychange", onVisible)
  }, [markUpToNewest])
}
