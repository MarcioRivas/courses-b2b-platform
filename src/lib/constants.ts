/** D21: single source of truth for the platform's working name. */
export const APP_NAME = "Kururu"

export const APP_DESCRIPTION = "Plataforma de formación deportiva multi-organización"

/** Shared Open Graph fields; pages that set `openGraph` must spread it (Next replaces, not merges). */
export const BASE_OPEN_GRAPH = { type: "website", siteName: APP_NAME, locale: "es_UY" } as const

/** Absolute public origin (SEO: canonical URLs, sitemap, Open Graph). No trailing slash. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || "https://kururu.academy").replace(/\/$/, "")

/** D8: route groups guarded by role. Kept in sync with proxy.ts + lib/auth/require-role.ts. */
export const PROTECTED_ROUTE_PREFIXES = ["/platform", "/admin", "/teach", "/learn"] as const

export const OTP_LENGTH = 6
