import { createClient } from "@/lib/supabase/server"
import { EmailForm } from "@/features/auth/components/email-form"
import { messages } from "@/lib/messages/es"
import { registrationTokenSchema } from "@/lib/validation/zod-helpers"

interface RegisterPageProps {
  params: Promise<{ token: string }>
}

export default async function RegisterPage({ params }: RegisterPageProps) {
  const { token } = await params
  const parsedToken = registrationTokenSchema.safeParse(token)

  const invalidLink = (
    <div className="flex flex-col gap-2 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.register.invalidLinkTitle}</h1>
      <p className="text-sm text-muted-foreground">{messages.register.invalidLinkDescription}</p>
    </div>
  )

  if (!parsedToken.success) {
    return invalidLink
  }

  const supabase = await createClient()
  const { data, error } = await supabase.rpc("get_registration_link_public", { p_token: parsedToken.data })
  const link = data?.[0]

  if (!error && link?.exhausted) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{messages.register.exhaustedTitle}</h1>
        <p className="text-sm text-muted-foreground">{messages.register.linkExhausted}</p>
      </div>
    )
  }

  if (error || !link || !link.valid) {
    return invalidLink
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{messages.register.title}</h1>
        <p className="text-sm text-muted-foreground">
          {messages.register.joiningOrgPrefix} {link.organization_name}.
        </p>
      </div>
      <EmailForm mode="register" token={parsedToken.data} />
    </div>
  )
}
