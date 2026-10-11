import { createClient } from "@/lib/supabase/server"
import { getMember } from "@/features/users/queries/get-member"
import type { StudentHeader } from "../types"

/**
 * Name of the student, plus email/phone only for an org ADMIN (reuses
 * `getMember`); a professor never receives `profile_private` (D27).
 * `null` when the profile is not visible to the caller.
 */
export async function getStudentHeader(
  userId: string,
  caller: { role: "ADMIN" | "PROFESSOR"; organizationId: string }
): Promise<StudentHeader | null> {
  if (caller.role === "ADMIN") {
    const member = await getMember(caller.organizationId, userId)
    return member
      ? { userId, firstName: member.firstName, lastName: member.lastName, email: member.email, phone: member.phone }
      : null
  }

  const supabase = await createClient()
  const { data } = await supabase.from("profiles").select("first_name, last_name").eq("id", userId).maybeSingle()

  return data ? { userId, firstName: data.first_name, lastName: data.last_name, email: null, phone: null } : null
}
