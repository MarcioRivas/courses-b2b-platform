import type { ReactNode } from "react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { AppShell } from "@/components/layout/app-shell"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { getUnreadMessageCount } from "@/features/messaging/queries/get-unread-message-count"
import { getUnreadNotificationCount } from "@/features/notifications/queries/get-unread-notification-count"

export default async function LearnLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgRole(["STUDENT"])
  const [unreadMessages, unreadNotifications, settings] = await Promise.all([
    getUnreadMessageCount(),
    getUnreadNotificationCount(),
    getOrgSettings(ctx.organizationId),
  ])
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  return (
    <AppShell
      role="STUDENT"
      organizationName={ctx.organizationName}
      userName={`${ctx.profile.firstName} ${ctx.profile.lastName}`}
      userEmail={ctx.user.email}
      messenger={{ currentUserId: ctx.user.id, initialUnread: unreadMessages, timeZone }}
      notifications={{ currentUserId: ctx.user.id, initialUnread: unreadNotifications, timeZone }}
    >
      {children}
    </AppShell>
  )
}
