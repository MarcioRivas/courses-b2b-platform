import { Badge } from "@/components/ui/badge"
import { moduleStateLabel } from "../unlock-labels"

interface ModuleStateChipProps {
  state: string
  /** Server-authored explanation; announced to screen readers with the chip (§54). */
  reason: string
}

export function ModuleStateChip({ state, reason }: ModuleStateChipProps) {
  const { label, tone } = moduleStateLabel(state)

  return (
    <Badge variant={tone} aria-label={`${label}. ${reason}`}>
      {label}
    </Badge>
  )
}
