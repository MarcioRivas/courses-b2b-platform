import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { SideNav } from "./side-nav"
import { TopNav } from "./top-nav"
import { SIDEBAR_COLLAPSED_COOKIE, type AppRole } from "./nav-config"
import { MessengerProvider } from "@/features/messaging/components/messenger-provider"
import { GradingNavBadgeProvider } from "./nav-badges"

interface AppShellProps {
  role: AppRole
  organizationName: string | null
  userName: string
  userEmail: string
  /** Org roles only: header chats + bottom chat windows. Absent for platform admins. */
  messenger?: { currentUserId: string; initialUnread: number; timeZone: string }
  /** Students and professors: header bell. Absent for admins and platform admins. */
  notifications?: { currentUserId: string; initialUnread: number; timeZone: string }
  /** Professors: pending-grading count on "Correcciones" (first-paint value; kept live client-side). */
  pendingGrading?: number
  children: ReactNode
}

/** Mobile-first shell: top bar + drop-down menu under `md`, collapsible sidebar at `md` and up. */
export async function AppShell({
  role,
  organizationName,
  userName,
  userEmail,
  messenger,
  notifications,
  pendingGrading,
  children,
}: AppShellProps) {
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1"

  const shell = (
    <div className="flex min-h-screen flex-col bg-muted/40 md:flex-row">
      <SideNav role={role} organizationName={organizationName} defaultCollapsed={sidebarCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav
          role={role}
          organizationName={organizationName}
          userName={userName}
          userEmail={userEmail}
          showMessenger={messenger !== undefined}
          notifications={notifications}
        />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )

  const withBadges =
    pendingGrading === undefined ? shell : <GradingNavBadgeProvider initial={pendingGrading}>{shell}</GradingNavBadgeProvider>

  return messenger ? <MessengerProvider {...messenger}>{withBadges}</MessengerProvider> : withBadges
}
