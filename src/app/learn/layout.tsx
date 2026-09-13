import type { ReactNode } from "react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { AppShell } from "@/components/layout/app-shell"

export default async function LearnLayout({ children }: { children: ReactNode }) {
  const ctx = await requireOrgRole(["STUDENT"])

  return (
    <AppShell
      role="STUDENT"
      organizationName={ctx.organizationName}
      userName={`${ctx.profile.firstName} ${ctx.profile.lastName}`}
      userEmail={ctx.user.email}
    >
      {children}
    </AppShell>
  )
}
