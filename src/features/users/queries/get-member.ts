import { createClient } from "@/lib/supabase/server"
import type { MembershipRole, MembershipStatus } from "../schemas/user-schemas"

export interface MemberGroup {
  id: string
  name: string
}

export interface MemberDetail {
  membershipId: string
  userId: string
  organizationId: string
  firstName: string
  lastName: string
  role: MembershipRole
  status: MembershipStatus
  email: string | null
  phone: string | null
  dni: string | null
  joinedAt: string
  groups: MemberGroup[]
}

/**
 * Member detail for the admin screen: membership + profile + admin-only PII
 * (D27) + group memberships. The group read is a second round trip rather than
 * an embed because `group_members` has no FK to `organization_memberships`; it
 * is filtered to this org so a member of several orgs never leaks the others.
 */
export async function getMember(organizationId: string, userId: string): Promise<MemberDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("organization_memberships")
    .select(
      `id, user_id, organization_id, role, status, joined_at,
       profiles!organization_memberships_user_id_fkey(
         first_name, last_name,
         profile_private(email, phone, dni)
       )`
    )
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  let groups: MemberGroup[] = []
  const { data: groupRows } = await supabase
    .from("group_members")
    .select("groups!inner(id, name, organization_id)")
    .eq("user_id", userId)
    .eq("groups.organization_id", organizationId)

  if (groupRows) {
    groups = groupRows
      .map((row) => row.groups)
      .filter((g): g is { id: string; name: string; organization_id: string } => g !== null)
      .map((g) => ({ id: g.id, name: g.name }))
  }

  return {
    membershipId: data.id,
    userId: data.user_id,
    organizationId: data.organization_id,
    firstName: data.profiles?.first_name ?? "",
    lastName: data.profiles?.last_name ?? "",
    role: data.role,
    status: data.status,
    email: data.profiles?.profile_private?.email ?? null,
    phone: data.profiles?.profile_private?.phone ?? null,
    dni: data.profiles?.profile_private?.dni ?? null,
    joinedAt: data.joined_at,
    groups,
  }
}
