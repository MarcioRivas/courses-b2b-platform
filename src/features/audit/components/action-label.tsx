import { Badge } from "@/components/ui/badge"
import { actionMeta } from "../action-catalog"

interface ActionLabelProps {
  action: string
}

/** Spanish label chip for a raw `audit_logs.action` value (see `action-catalog.ts`). */
export function ActionLabel({ action }: ActionLabelProps) {
  const meta = actionMeta(action)
  return <Badge variant="outline">{meta.label}</Badge>
}
