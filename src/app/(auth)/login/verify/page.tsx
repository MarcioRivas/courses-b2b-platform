import { redirect } from "next/navigation"
import { OtpForm } from "@/features/auth/components/otp-form"
import { messages } from "@/lib/messages/es"
import { registrationTokenSchema } from "@/lib/validation/zod-helpers"
import type { AuthMode } from "@/features/auth/schemas/auth-schemas"

interface VerifyPageProps {
  searchParams: Promise<{ email?: string; mode?: string; token?: string }>
}

export default async function VerifyPage({ searchParams }: VerifyPageProps) {
  const params = await searchParams
  const email = params.email

  if (!email) {
    return redirect("/login")
  }

  const mode: AuthMode = params.mode === "register" ? "register" : "login"

  // The token is a raw URL search param — validate its shape before it flows
  // into OtpForm and eventually a server-side redirect path (W3).
  if (mode === "register") {
    const parsedToken = registrationTokenSchema.safeParse(params.token)
    if (!parsedToken.success) {
      return redirect("/login")
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.login.otpSentTitle}</h1>
      <OtpForm email={email} mode={mode} token={params.token} />
    </div>
  )
}
