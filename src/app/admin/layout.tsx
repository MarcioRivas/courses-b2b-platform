import type { ReactNode } from "react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { AppShell } from "@/components/layout/app-shell"

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgRole(["ADMIN"])

  return (
    <AppShell
      role="ADMIN"
      organizationName={ctx.organizationName}
      userName={`${ctx.profile.firstName} ${ctx.profile.lastName}`}
      userEmail={ctx.user.email}
    >
      {children}
    </AppShell>
  )
}
