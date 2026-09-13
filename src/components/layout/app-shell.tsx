import type { ReactNode } from "react"
import { SideNav, type AppRole } from "./side-nav"
import { TopNav } from "./top-nav"

interface AppShellProps {
  role: AppRole
  organizationName: string | null
  userName: string
  userEmail: string
  children: ReactNode
}

/** Mobile-first shell: top bar + Sheet nav under `md`, sidebar at `md` and up. */
export function AppShell({ role, organizationName, userName, userEmail, children }: AppShellProps) {
  return (
    <div className="flex min-h-screen flex-col md:flex-row">
      <SideNav role={role} organizationName={organizationName} />
      <div className="flex flex-1 flex-col">
        <TopNav role={role} organizationName={organizationName} userName={userName} userEmail={userEmail} />
        <main className="flex-1 p-4 md:p-6">{children}</main>
      </div>
    </div>
  )
}
