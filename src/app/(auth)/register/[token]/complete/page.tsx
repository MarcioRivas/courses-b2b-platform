import { redirect } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
import { ProfileForm } from "@/features/auth/components/profile-form"
import { messages } from "@/lib/messages/es"
import { registrationTokenSchema } from "@/lib/validation/zod-helpers"

interface CompleteRegistrationPageProps {
  params: Promise<{ token: string }>
}

export default async function CompleteRegistrationPage({ params }: CompleteRegistrationPageProps) {
  const { token } = await params
  const parsedToken = registrationTokenSchema.safeParse(token)

  if (!parsedToken.success) {
    return (
      <div className="flex flex-col gap-2 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">{messages.register.invalidLinkTitle}</h1>
        <p className="text-sm text-muted-foreground">{messages.register.invalidLinkDescription}</p>
      </div>
    )
  }

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return redirect(`/register/${parsedToken.data}`)
  }

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">{messages.register.profileTitle}</h1>
      <ProfileForm token={parsedToken.data} />
    </div>
  )
}
