"use client"

import { createClient } from "@/lib/supabase/client"

interface SubscribeOptions {
  userId: string
  /** Any INSERT (new) or UPDATE (grouped bump, read elsewhere) of this user's rows. */
  onChange: () => void
  /** Fires on every join, including rejoins after a dropped socket: the moment to catch up. */
  onSubscribed?: () => void
}

/**
 * Subscribes to the user's own `notifications` rows. The `user_id` filter
 * narrows the feed server-side; Realtime also applies `notifications_select`
 * RLS, which needs the user's JWT on the socket, hence `setAuth` before
 * `subscribe` (same as subscribe-to-new-messages). Returns the unsubscribe.
 */
export function subscribeToNotificationChanges(options: SubscribeOptions): () => void {
  const supabase = createClient()
  const filter = `user_id=eq.${options.userId}`
  // Unique per mount: reusing a name while the previous channel is being removed returns that dying channel.
  const channel = supabase
    .channel(`notifications:${options.userId}:${crypto.randomUUID()}`)
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, () =>
      options.onChange()
    )
    .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, () =>
      options.onChange()
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
      // No live updates for this mount; opening the panel still refetches.
    })

  return () => {
    active = false
    void supabase.removeChannel(channel)
  }
}
