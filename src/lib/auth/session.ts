import { cache } from "react"
import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database.types"

export type MembershipRole = Database["public"]["Enums"]["membership_role"]
export type MembershipState = "NONE" | "SINGLE" | "MULTIPLE"

export interface SessionContext {
  user: { id: string; email: string }
  profile: { firstName: string; lastName: string }
  organizationId: string | null
  organizationName: string | null
  role: MembershipRole | null
  isPlatformAdmin: boolean
  membershipState: MembershipState
}

/**
 * Single-query session resolver (B7): reverse-embeds `organization_memberships`
 * and `platform_admins` off `profiles` so one round trip yields identity, the
 * single ACTIVE membership (if any) and the platform-admin flag. Memoized per
 * request since every route-group layout calls this via require-role helpers.
 */
export const getSessionContext = cache(async (): Promise<SessionContext | null> => {
  const supabase = await createClient()

  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) {
    return null
  }

  // `platform_admins` has two FKs to `profiles` (created_by, user_id) — the
  // embed must name the FK explicitly or PostgREST rejects it as ambiguous.
  const { data, error } = await supabase
    .from("profiles")
    .select(
      `first_name, last_name,
       platform_admins!platform_admins_user_id_fkey(user_id),
       organization_memberships(role, status, organizations(id, name, status))`
    )
    .eq("id", user.id)
    .maybeSingle()

  if (error) {
    return null
  }

  // Authenticated (valid session) but no `profiles` row yet — e.g. the user
  // verified an OTP but abandoned registration before submitting the profile
  // form. Must resolve to `membershipState: "NONE"` (not `null`) so guards
  // (requireOrgRole/requirePlatformAdmin) send them to `/register-required`
  // instead of `/login`, which would otherwise loop them back to a page they
  // can already pass (W1).
  if (!data) {
    return {
      user: { id: user.id, email: user.email },
      profile: { firstName: "", lastName: "" },
      organizationId: null,
      organizationName: null,
      role: null,
      isPlatformAdmin: false,
      membershipState: "NONE",
    }
  }

  const activeMemberships = (data.organization_memberships ?? []).filter(
    (m) => m.status === "ACTIVE" && m.organizations?.status === "ACTIVE"
  )

  const membershipState: MembershipState =
    activeMemberships.length === 0 ? "NONE" : activeMemberships.length === 1 ? "SINGLE" : "MULTIPLE"

  const active = membershipState === "SINGLE" ? activeMemberships[0] : undefined

  return {
    user: { id: user.id, email: user.email },
    profile: { firstName: data.first_name, lastName: data.last_name },
    organizationId: active?.organizations?.id ?? null,
    organizationName: active?.organizations?.name ?? null,
    role: active?.role ?? null,
    isPlatformAdmin: data.platform_admins !== null,
    membershipState,
  }
})
