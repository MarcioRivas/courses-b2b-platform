import { createClient } from "@/lib/supabase/server"
import type { AssignableProfessor } from "../types"

const CAP = 200

interface ListAssignableProfessorsParams {
  organizationId: string
  courseId: string
}

/** ACTIVE PROFESSOR members of the org not already assigned to the course, capped at 200 (mirrors list-assignable-students). */
export async function listAssignableProfessors({
  organizationId,
  courseId,
}: ListAssignableProfessorsParams): Promise<AssignableProfessor[]> {
  const supabase = await createClient()

  const { data: existing } = await supabase
    .from("course_professors")
    .select("user_id")
    .eq("course_id", courseId)
  const excludeIds = (existing ?? []).map((row) => row.user_id)

  let query = supabase
    .from("organization_memberships")
    .select("user_id, profiles!organization_memberships_user_id_fkey(first_name, last_name)")
    .eq("organization_id", organizationId)
    .eq("role", "PROFESSOR")
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

  return (data ?? [])
    .map((membership) => ({
      userId: membership.user_id,
      firstName: membership.profiles?.first_name ?? "",
      lastName: membership.profiles?.last_name ?? "",
    }))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es"))
}
