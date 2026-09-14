import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSessionContext } from "@/lib/auth/session"
import { roleHome } from "@/lib/auth/role-home"
import { APP_DESCRIPTION, APP_NAME } from "@/lib/constants"
import { LandingPage } from "@/features/landing/components/landing-page"
import { landingMessages } from "@/lib/messages/landing"

export const metadata: Metadata = {
  title: `${APP_NAME} — ${landingMessages.meta.title}`,
  description: APP_DESCRIPTION,
}

export default async function HomePage() {
  const ctx = await getSessionContext()
  if (ctx) redirect(roleHome(ctx))
  return <LandingPage />
}
