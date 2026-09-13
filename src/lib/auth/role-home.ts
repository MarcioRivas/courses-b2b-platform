import type { SessionContext } from "./session"

/** Landing route for a resolved session. No org switcher (B7) — one destination per user. */
export function roleHome(ctx: SessionContext): string {
  if (ctx.isPlatformAdmin) {
    return "/platform"
  }

  if (ctx.membershipState !== "SINGLE" || !ctx.role) {
    return "/register-required"
  }

  switch (ctx.role) {
    case "ADMIN":
      return "/admin"
    case "PROFESSOR":
      return "/teach"
    case "STUDENT":
      return "/learn"
  }
}
