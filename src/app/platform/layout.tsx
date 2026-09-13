import type { ReactNode } from "react"
import { requirePlatformAdmin } from "@/lib/auth/require-role"
import { AppShell } from "@/components/layout/app-shell"

export default async function PlatformLayout({ children }: { children: ReactNode }) {
  const ctx = await requirePlatformAdmin()

  return (
    <AppShell
      role="PLATFORM_ADMIN"
      organizationName={null}
      userName={`${ctx.profile.firstName} ${ctx.profile.lastName}`}
      userEmail={ctx.user.email}
    >
      {children}
    </AppShell>
  )
}
