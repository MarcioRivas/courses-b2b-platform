import type { ReactNode } from "react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { AppShell } from "@/components/layout/app-shell"

export default async function TeachLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgRole(["PROFESSOR"])

  return (
    <AppShell
      role="PROFESSOR"
      organizationName={ctx.organizationName}
      userName={`${ctx.profile.firstName} ${ctx.profile.lastName}`}
      userEmail={ctx.user.email}
    >
      {children}
    </AppShell>
  )
}
