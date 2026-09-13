export interface LinkStateInput {
  isActive: boolean
  revokedAt: string | null
  expiresAt: string | null
}

export type LinkState = "ACTIVE" | "INACTIVE" | "EXPIRED" | "REVOKED"

/**
 * Pure precedence: revoked > expired > inactive > active. No "Agotado" state —
 * `max_uses` was removed (D34). `expiresAt` exactly equal to now counts as
 * expired (the link's window is inclusive of the past, not the instant).
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
  return "ACTIVE"
}
