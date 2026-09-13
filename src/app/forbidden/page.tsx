import Link from "next/link"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"

export default function ForbiddenPage() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-6 text-center">
      <h1 className="text-2xl font-semibold">{messages.forbidden.title}</h1>
      <p className="text-sm text-muted-foreground">{messages.forbidden.description}</p>
      <Button render={<Link href="/" />}>{messages.common.backHome}</Button>
    </div>
  )
}
