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
        <h2 className="text-base font-semibold">{messages.register.invalidLinkTitle}</h2>
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
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{messages.register.profileTitle}</h2>
      <ProfileForm token={parsedToken.data} />
    </div>
  )
}
