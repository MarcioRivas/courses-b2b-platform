import { createClient } from "@/lib/supabase/server"
import type { AssignableStudent } from "../types"

const CAP = 200

interface ListAssignableStudentsParams {
  organizationId: string
  groupId: string
}

/**
 * ACTIVE STUDENT members of the org not already in the group, capped at 200
 * (sensible for MVP org sizes — the picker filters this list client-side).
 */
export async function listAssignableStudents({
  organizationId,
  groupId,
}: ListAssignableStudentsParams): Promise<AssignableStudent[]> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("group_members")
    .select("user_id")
    .eq("group_id", groupId)
  const excludeIds = (existing ?? []).map((member) => member.user_id)

  let query = supabase
    .from("organization_memberships")
    .select("user_id, profiles!organization_memberships_user_id_fkey(first_name, last_name)")
    .eq("organization_id", organizationId)
    .eq("role", "STUDENT")
    .eq("status", "ACTIVE")
    .order("user_id")
    .limit(CAP)

  if (excludeIds.length > 0) {
    query = query.not("user_id", "in", `(${excludeIds.join(",")})`)
  }

  const { data, error } = await query
  if (error) {
    return []
  }

  // Sorted by name in memory: the sort key lives on the embedded `profiles`
  // row, which PostgREST cannot order at the top level. Safe because the query
  // is capped at CAP rows and the picker filters this same list client-side.
  return (data ?? [])
    .map((membership) => ({
      userId: membership.user_id,
      firstName: membership.profiles?.first_name ?? "",
      lastName: membership.profiles?.last_name ?? "",
    }))
    .sort((a, b) =>
      `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es")
    )
}
