export interface LinkStateInput {
  isActive: boolean
  revokedAt: string | null
  expiresAt: string | null
  useCount?: number
  maxUses?: number | null
}

export type LinkState = "ACTIVE" | "INACTIVE" | "EXPIRED" | "REVOKED" | "EXHAUSTED"

/**
 * Pure precedence: revoked > expired > inactive > exhausted > active.
 * `expiresAt` exactly equal to now counts as expired (the link's window is
 * inclusive of the past, not the instant). A link is exhausted once
 * `useCount` reaches `maxUses` (null/undefined = unlimited).
 */
export function linkState(link: LinkStateInput): LinkState {
  if (link.revokedAt) {
    return "REVOKED"
  }
  if (link.expiresAt && new Date(link.expiresAt).getTime() <= Date.now()) {
    return "EXPIRED"
  }
  if (!link.isActive) {
    return "INACTIVE"
  }
  if (link.maxUses != null && (link.useCount ?? 0) >= link.maxUses) {
    return "EXHAUSTED"
  }
  return "ACTIVE"
}
