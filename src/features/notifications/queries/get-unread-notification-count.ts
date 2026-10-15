import "server-only"

import { createClient } from "@/lib/supabase/server"

/** Unread notifications for the header bell (first paint). Never throws: 0 on error. */
export async function getUnreadNotificationCount(): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("my_unread_notification_count")

  return error || typeof data !== "number" ? 0 : data
}
