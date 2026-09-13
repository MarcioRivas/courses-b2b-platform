import { redirect } from "next/navigation"
import { getSessionContext, type MembershipRole, type SessionContext } from "./session"

export type OrgSessionContext = SessionContext & {
  role: MembershipRole
  organizationId: string
  organizationName: string
}

/**
 * Guards a `/admin`, `/teach` or `/learn` layout. Redirects to `/login` (no
 * session), `/register-required` (no single ACTIVE membership, B7) or
 * `/forbidden` (membership exists but role doesn't match).
 */
export async function requireOrgRole(roles: MembershipRole[]): Promise<OrgSessionContext> {
  const ctx = await getSessionContext()

  if (!ctx) {
    return redirect("/login")
  }

  if (
    ctx.membershipState !== "SINGLE" ||
    ctx.role === null ||
    ctx.organizationId === null ||
    ctx.organizationName === null
  ) {
    return redirect("/register-required")
  }

  if (!roles.includes(ctx.role)) {
    return redirect("/forbidden")
  }

  // The checks above proved role/organizationId/organizationName are non-null;
  // TS narrows `ctx.role` at each access site but not the shape of `ctx` itself.
  return ctx as OrgSessionContext
}

/** Guards `/platform`. Redirects to `/login` or `/forbidden`. */
export async function requirePlatformAdmin(): Promise<SessionContext> {
  const ctx = await getSessionContext()

  if (!ctx) {
    return redirect("/login")
  }

  if (!ctx.isPlatformAdmin) {
    return redirect("/forbidden")
  }

  return ctx
}
