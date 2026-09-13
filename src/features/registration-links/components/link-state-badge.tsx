import { Badge } from "@/components/ui/badge"
import { adminLinksMessages } from "@/lib/messages/admin-links"
import { linkState, type LinkState, type LinkStateInput } from "../link-state"

const VARIANT: Record<LinkState, "default" | "secondary" | "outline" | "destructive"> = {
  ACTIVE: "default",
  INACTIVE: "secondary",
  EXPIRED: "outline",
  REVOKED: "destructive",
}

export function LinkStateBadge({ link }: { link: LinkStateInput }) {
  const state = linkState(link)
  return <Badge variant={VARIANT[state]}>{adminLinksMessages.state[state]}</Badge>
}
