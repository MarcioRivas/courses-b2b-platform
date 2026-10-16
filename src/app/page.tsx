import type { Metadata } from "next"
import { redirect } from "next/navigation"
import { getSessionContext } from "@/lib/auth/session"
import { roleHome } from "@/lib/auth/role-home"
import { APP_NAME, BASE_OPEN_GRAPH } from "@/lib/constants"
import { LandingPage } from "@/features/landing/components/landing-page"
import { LandingStructuredData } from "@/features/landing/components/landing-structured-data"
import { landingMessages } from "@/lib/messages/landing"

const title = `${APP_NAME} — ${landingMessages.meta.title}`
const { description } = landingMessages.meta

export const metadata: Metadata = {
  title: { absolute: title },
  description,
  alternates: { canonical: "/" },
  openGraph: { ...BASE_OPEN_GRAPH, title, description, url: "/" },
  twitter: { card: "summary_large_image", title, description },
}

export default async function HomePage() {
  const ctx = await getSessionContext()
  if (ctx) redirect(roleHome(ctx))
  return (
    <>
      <LandingStructuredData />
      <LandingPage />
    </>
  )
}
