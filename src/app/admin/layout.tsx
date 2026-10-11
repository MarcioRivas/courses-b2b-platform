import type { ReactNode } from "react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { AppShell } from "@/components/layout/app-shell"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { getUnreadMessageCount } from "@/features/messaging/queries/get-unread-message-count"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgRole(["ADMIN"])
  const [unreadMessages, settings] = await Promise.all([getUnreadMessageCount(), getOrgSettings(ctx.organizationId)])

  return (
    <AppShell
      role="ADMIN"
      organizationName={ctx.organizationName}
      userName={`${ctx.profile.firstName} ${ctx.profile.lastName}`}
      userEmail={ctx.user.email}
      messenger={{
        currentUserId: ctx.user.id,
        initialUnread: unreadMessages,
        timeZone: settings?.timezone ?? DEFAULT_TIME_ZONE,
      }}
    >
      {children}
    </AppShell>
  )
}
