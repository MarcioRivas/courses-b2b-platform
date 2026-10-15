import { PresentationIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { WelcomeHero } from "@/components/shared/welcome-hero"
import { messages } from "@/lib/messages/es"

/**
 * Professor home: a welcome only, like the admin home (user decision
 * 2026-10-15). Pending grading shows as the badge on "Correcciones".
 */
export default async function TeachPage() {
  const ctx = await requireOrgRole(["PROFESSOR"])

  return (
    <WelcomeHero firstName={ctx.profile.firstName} roleLabel={messages.home.professor} roleIcon={PresentationIcon} />
  )
}
