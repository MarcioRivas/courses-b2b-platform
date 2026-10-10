import { CalendarClockIcon, CheckIcon, LockIcon, PlayIcon, TimerOffIcon, type LucideIcon } from "lucide-react"
import { cn } from "@/lib/utils"
import { isModuleState, type ModuleState } from "../unlock-labels"

const ICONS: Record<ModuleState, { icon: LucideIcon; className: string }> = {
  AVAILABLE: { icon: PlayIcon, className: "bg-brand-soft text-primary" },
  COMPLETED: { icon: CheckIcon, className: "bg-success text-success-foreground" },
  LOCKED_DEPENDENCY: { icon: LockIcon, className: "bg-muted text-muted-foreground" },
  UPCOMING: { icon: CalendarClockIcon, className: "bg-muted text-muted-foreground" },
  EXPIRED: { icon: TimerOffIcon, className: "bg-destructive/10 text-destructive" },
}

/** Round state marker at the start of a module card; the chip carries the accessible label. */
export function ModuleStateIcon({ state }: { state: string }) {
  const { icon: Icon, className } = ICONS[isModuleState(state) ? state : "LOCKED_DEPENDENCY"]

  return (
    <span aria-hidden className={cn("grid size-9 shrink-0 place-items-center rounded-full", className)}>
      <Icon className="size-4" strokeWidth={2.5} />
    </span>
  )
}
