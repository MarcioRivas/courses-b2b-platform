/** D21: single source of truth for the platform's working name. */
export const APP_NAME = "Kururu"

export const APP_DESCRIPTION = "Plataforma de formación deportiva multi-organización"

/** D8: route groups guarded by role. Kept in sync with proxy.ts + lib/auth/require-role.ts. */
export const PROTECTED_ROUTE_PREFIXES = ["/platform", "/admin", "/teach", "/learn"] as const

export const OTP_LENGTH = 6
