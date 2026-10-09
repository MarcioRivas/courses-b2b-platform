import type { ReactNode } from "react"
import { cookies } from "next/headers"
import { SideNav } from "./side-nav"
import { TopNav } from "./top-nav"
import { SIDEBAR_COLLAPSED_COOKIE, type AppRole } from "./nav-config"

interface AppShellProps {
  role: AppRole
  organizationName: string | null
  userName: string
  userEmail: string
  children: ReactNode
}

/** Mobile-first shell: top bar + drop-down menu under `md`, collapsible sidebar at `md` and up. */
export async function AppShell({ role, organizationName, userName, userEmail, children }: AppShellProps) {
  const sidebarCollapsed = (await cookies()).get(SIDEBAR_COLLAPSED_COOKIE)?.value === "1"

  return (
    <div className="flex min-h-screen flex-col bg-muted/40 md:flex-row">
      <SideNav role={role} organizationName={organizationName} defaultCollapsed={sidebarCollapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopNav role={role} organizationName={organizationName} userName={userName} userEmail={userEmail} />
        <main className="mx-auto w-full max-w-6xl flex-1 p-4 md:p-8">{children}</main>
      </div>
    </div>
  )
}
