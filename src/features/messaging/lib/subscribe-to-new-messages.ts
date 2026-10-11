"use client"

import { createClient } from "@/lib/supabase/client"
import type { ChatMessage } from "../types"

interface MessageRow {
  id: string
  conversation_id: string
  sender_id: string
  body: string
  created_at: string
}

interface SubscribeOptions {
  /** Server-side Realtime filter, e.g. `conversation_id=eq.<id>` or `recipient_id=eq.<uid>`. */
  filter: string
  onMessage: (message: ChatMessage) => void
  /** Fires on every join, including rejoins after a dropped socket: the moment to catch up. */
  onSubscribed?: () => void
}

/**
 * Subscribes to INSERTs on `messages`. The filter narrows the feed server-side;
 * Realtime then also applies `messages_select` RLS per subscriber, which needs
 * the socket to carry the user's JWT (not the anon key), hence `setAuth`
 * before `subscribe`. Returns the unsubscribe function.
 */
export function subscribeToNewMessages(channelName: string, options: SubscribeOptions): () => void {
  const supabase = createClient()
  // Unique per mount: the browser client is shared, and reusing a name while
  // the previous channel is still being removed (close + quick reopen, or a
  // StrictMode double mount) would hand back that dying channel.
  const channel = supabase.channel(`${channelName}:${crypto.randomUUID()}`).on(
    "postgres_changes",
    { event: "INSERT", schema: "public", table: "messages", filter: options.filter },
    (payload) => {
      const row = payload.new as MessageRow
      options.onMessage({
        id: row.id,
        conversationId: row.conversation_id,
        senderId: row.sender_id,
        body: row.body,
        createdAt: row.created_at,
      })
    }
  )

  let active = true
  supabase.auth
    .getSession()
    .then(async ({ data }) => {
      if (!active) return
      await supabase.realtime.setAuth(data.session?.access_token ?? null)
      if (!active) return
      channel.subscribe((status) => {
        if (status === "SUBSCRIBED" && active) options.onSubscribed?.()
      })
    })
    .catch(() => {
      // No live updates for this mount; the inbox/panel refetch on open still works.
    })

  return () => {
    active = false
    void supabase.removeChannel(channel)
  }
}
