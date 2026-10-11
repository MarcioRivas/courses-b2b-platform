import "server-only"

import { createClient } from "@/lib/supabase/server"

/** Unread messages across the caller's conversations (header badge, first paint). Never throws: 0 on error. */
export async function getUnreadMessageCount(): Promise<number> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("my_unread_message_count")

  return error || typeof data !== "number" ? 0 : data
}
