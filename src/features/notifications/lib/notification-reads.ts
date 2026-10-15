"use client"

import { createClient } from "@/lib/supabase/client"
import type { ActionResult } from "@/lib/errors"
import { notificationsMessages } from "@/lib/messages/notifications"
import type { Database } from "@/types/database.types"
import { NOTIFICATIONS_PAGE_SIZE, type AppNotification } from "../types"

/**
 * Read paths, called from the browser with the user's session (same reasoning
 * as messaging-reads: rows are guarded by RLS + SECURITY DEFINER RPCs, and
 * Server Actions from one client run one at a time). Writes stay Server Actions.
 */

type NotificationRow = Database["public"]["Functions"]["my_notifications"]["Returns"][number]

export interface NotificationsPage {
  items: AppNotification[]
  hasMore: boolean
}

const failed = <T>(): ActionResult<T> => ({ ok: false, code: "INTERNAL", message: notificationsMessages.panel.failed })

function toNotification(row: NotificationRow): AppNotification {
  return {
    id: row.id,
    type: row.type,
    entityId: row.entity_id,
    offeringId: row.offering_id,
    payload: row.payload && typeof row.payload === "object" && !Array.isArray(row.payload) ? row.payload : {},
    readAt: row.read_at,
    updatedAt: row.updated_at,
  }
}

/** Newest first. `before` = the last loaded row, the cursor for the next page. */
export async function fetchNotifications(
  before?: Pick<AppNotification, "id" | "updatedAt">
): Promise<ActionResult<NotificationsPage>> {
  const { data, error } = await createClient().rpc("my_notifications", {
    p_limit: NOTIFICATIONS_PAGE_SIZE,
    p_before: before?.updatedAt,
    p_before_id: before?.id,
  })
  if (error) return failed()
  const items = (data ?? []).map(toNotification)
  return { ok: true, data: { items, hasMore: items.length === NOTIFICATIONS_PAGE_SIZE } }
}

export async function fetchUnreadNotificationCount(): Promise<ActionResult<number>> {
  const { data, error } = await createClient().rpc("my_unread_notification_count")
  return error ? failed() : { ok: true, data: data ?? 0 }
}
