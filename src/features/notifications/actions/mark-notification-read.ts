"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { notificationsMessages } from "@/lib/messages/notifications"
import { markNotificationReadSchema, type MarkNotificationReadInput } from "../schemas/notification-schemas"
import { NOTIFICATION_ROLES } from "../lib/notification-roles"

/** Marks one of the caller's notifications read (someone else's id is a no-op in the RPC). */
export async function markNotificationRead(input: MarkNotificationReadInput): Promise<ActionResult<null>> {
  const parsed = markNotificationReadSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(NOTIFICATION_ROLES)
  const supabase = await createClient()

  const { error } = await supabase.rpc("mark_notification_read", { p_notification: parsed.data.notificationId })
  if (error) {
    return { ok: false, code: "INTERNAL", message: notificationsMessages.panel.failed }
  }

  return { ok: true, data: null }
}
