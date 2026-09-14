import { redirect } from "next/navigation"
import { getSessionContext } from "@/lib/auth/session"
import { messages } from "@/lib/messages/es"
import { Button } from "@/components/ui/button"

export default async function RegisterRequiredPage() {
  const ctx = await getSessionContext()

  if (!ctx) {
    return redirect("/login")
  }

  const copy = ctx.membershipState === "MULTIPLE" ? messages.multipleOrgs : messages.registerRequired

  return (
    <div className="flex flex-col gap-6 text-center">
      <h1 className="text-2xl font-semibold tracking-tight">{copy.title}</h1>
      <p className="text-sm text-muted-foreground">{copy.description}</p>
      <form action="/logout" method="post">
        <Button type="submit" variant="outline" className="w-full">
          {messages.common.logout}
        </Button>
      </form>
    </div>
  )
}
