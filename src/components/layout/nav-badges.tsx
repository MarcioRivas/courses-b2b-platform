"use client"

import { createContext, useContext, type ReactNode } from "react"
import { usePendingGradingCount } from "@/features/grading/hooks/use-pending-grading-count"

/** Nav items that can carry a red counter (see `NavItem.badge`). */
export type NavBadgeKey = "grading"

type NavBadgeCounts = Partial<Record<NavBadgeKey, number>>

const NavBadgesContext = createContext<NavBadgeCounts>({})

/** Counter for one nav item; 0 when that badge is not provided for this shell. */
export function useNavBadge(key: NavBadgeKey | undefined): number {
  const counts = useContext(NavBadgesContext)
  return key ? (counts[key] ?? 0) : 0
}

/**
 * Professor shell: keeps the "Correcciones" pending count live for both the
 * desktop sidebar and the mobile menu (one fetcher, shared by context).
 */
export function GradingNavBadgeProvider({ initial, children }: { initial: number; children: ReactNode }) {
  const grading = usePendingGradingCount(initial)
  return <NavBadgesContext.Provider value={{ grading }}>{children}</NavBadgesContext.Provider>
}
