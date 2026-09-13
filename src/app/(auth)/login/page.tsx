import { EmailForm } from "@/features/auth/components/email-form"
import { messages } from "@/lib/messages/es"

export default function LoginPage() {
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold">{messages.login.title}</h2>
      <EmailForm mode="login" />
    </div>
  )
}
