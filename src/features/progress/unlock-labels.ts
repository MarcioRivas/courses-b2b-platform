import { learnMessages } from "@/lib/messages/learn"

/** The five states `module_unlock_state` can return (phase-04). */
export const MODULE_STATES = [
  "AVAILABLE",
  "LOCKED_DEPENDENCY",
  "UPCOMING",
  "EXPIRED",
  "COMPLETED",
] as const

export type ModuleState = (typeof MODULE_STATES)[number]

export type ChipTone = "default" | "secondary" | "outline" | "destructive"

export interface ModuleStateLabel {
  label: string
  tone: ChipTone
  /** Whether the student may open the module's lessons from here. */
  openable: boolean
}

const LABELS: Record<ModuleState, ModuleStateLabel> = {
  AVAILABLE: { label: learnMessages.states.AVAILABLE, tone: "default", openable: true },
  COMPLETED: { label: learnMessages.states.COMPLETED, tone: "secondary", openable: true },
  LOCKED_DEPENDENCY: { label: learnMessages.states.LOCKED_DEPENDENCY, tone: "outline", openable: false },
  UPCOMING: { label: learnMessages.states.UPCOMING, tone: "outline", openable: false },
  EXPIRED: { label: learnMessages.states.EXPIRED, tone: "destructive", openable: false },
}

export function isModuleState(value: string): value is ModuleState {
  return (MODULE_STATES as readonly string[]).includes(value)
}

/**
 * Pure state -> chip mapping. The *reason* text never comes from here — the
 * server authors it inside `module_unlock_state` so the explanation the student
 * reads and the rule that blocked them can never drift apart (§53).
 *
 * An unknown state (a future migration adding one before the UI ships) falls
 * back to the most restrictive presentation rather than throwing.
 */
export function moduleStateLabel(state: string): ModuleStateLabel {
  return isModuleState(state) ? LABELS[state] : LABELS.LOCKED_DEPENDENCY
}
