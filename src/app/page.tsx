import { redirect } from "next/navigation"
import { getSessionContext } from "@/lib/auth/session"
import { roleHome } from "@/lib/auth/role-home"

export default async function HomePage() {
  const ctx = await getSessionContext()
  return redirect(ctx ? roleHome(ctx) : "/login")
}
