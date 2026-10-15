"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { notificationsMessages } from "@/lib/messages/notifications"
import { NOTIFICATION_ROLES } from "../lib/notification-roles"

export async function markAllNotificationsRead(): Promise<ActionResult<null>> {
  await requireOrgRole(NOTIFICATION_ROLES)
  const supabase = await createClient()

  const { error } = await supabase.rpc("mark_all_notifications_read")
  if (error) {
    return { ok: false, code: "INTERNAL", message: notificationsMessages.panel.failed }
  }

  return { ok: true, data: null }
}
