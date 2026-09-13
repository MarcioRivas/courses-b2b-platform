import type { SessionContext } from "./session"

export type AdminOrgScope =
  | { ok: true; organizationId: string }
  | { ok: false; code: "UNAUTHENTICATED" | "FORBIDDEN" }

/**
 * Decides which organization an admin Server Action may act on (D23).
 *
 * A platform admin may name any organization explicitly, because the platform
 * organization screens operate on tenants they are not a member of. Everyone
 * else is pinned to their session organization: a requested id that differs is
 * refused rather than silently ignored, so a tampered form field cannot widen
 * the blast radius.
 *
 * Pure and synchronous on purpose — this is the one tenant-boundary decision
 * that lives in TypeScript rather than in an RPC guard, so it must be directly
 * testable. The RPCs still re-derive the org from the entity row (D25).
 */
export function resolveAdminOrgScope(
  ctx: SessionContext | null,
  requestedOrganizationId?: string
): AdminOrgScope {
  if (!ctx) {
    return { ok: false, code: "UNAUTHENTICATED" }
  }

  if (ctx.isPlatformAdmin) {
    const organizationId = requestedOrganizationId ?? ctx.organizationId
    return organizationId ? { ok: true, organizationId } : { ok: false, code: "FORBIDDEN" }
  }

  if (ctx.role !== "ADMIN" || !ctx.organizationId) {
    return { ok: false, code: "FORBIDDEN" }
  }

  if (requestedOrganizationId && requestedOrganizationId !== ctx.organizationId) {
    return { ok: false, code: "FORBIDDEN" }
  }

  return { ok: true, organizationId: ctx.organizationId }
}
