import type { Metadata } from "next"
import { EmailForm } from "@/features/auth/components/email-form"
import { messages } from "@/lib/messages/es"

export const metadata: Metadata = {
  title: messages.login.title,
  alternates: { canonical: "/login" },
}

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.login.title}</h1>
      <EmailForm mode="login" />
    </div>
  )
}
