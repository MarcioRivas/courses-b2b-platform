import { ShieldCheckIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { WelcomeHero } from "@/components/shared/welcome-hero"
import { messages } from "@/lib/messages/es"

/**
 * Admin home: a welcome only. Statistics live under "Estadísticas" in the
 * sidebar (user decision 2026-10-11), so this page runs no analytics query.
 */
export default async function AdminPage() {
  const ctx = await requireOrgRole(["ADMIN"])

  return <WelcomeHero firstName={ctx.profile.firstName} roleLabel={messages.home.admin} roleIcon={ShieldCheckIcon} />
}
