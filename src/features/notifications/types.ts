import type { Database } from "@/types/database.types"

export type NotificationType = Database["public"]["Enums"]["notification_type"]

/** One bell row. `payload` holds titles/ids/counts written by the database (see notifications migration). */
export interface AppNotification {
  id: string
  type: NotificationType
  entityId: string
  offeringId: string | null
  payload: Record<string, unknown>
  readAt: string | null
  updatedAt: string
}

/** What the bell renders for a notification: built in TS so the database never stores routes. */
export interface NotificationView {
  title: string
  body: string
  href: string
}

export const NOTIFICATIONS_PAGE_SIZE = 20
