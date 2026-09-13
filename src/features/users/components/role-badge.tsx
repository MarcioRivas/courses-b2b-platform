import { Badge } from "@/components/ui/badge"
import { messages } from "@/lib/messages/es"
import type { MembershipRole } from "../schemas/user-schemas"

const VARIANT: Record<MembershipRole, "default" | "secondary" | "outline"> = {
  ADMIN: "default",
  PROFESSOR: "secondary",
  STUDENT: "outline",
}

export function RoleBadge({ role }: { role: MembershipRole }) {
  return <Badge variant={VARIANT[role]}>{messages.roles[role]}</Badge>
}
