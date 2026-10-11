import { createClient } from "@/lib/supabase/server"
import type { ProfessorStudent } from "../types"

/** Students enrolled (non-cancelled) in editions the professor teaches, one row per student. */
export async function listProfessorStudents(professorId: string): Promise<ProfessorStudent[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("course_enrollments")
    .select(
      `user_id, status,
       profiles!course_enrollments_user_id_fkey(first_name, last_name),
       course_offerings!inner(name, offering_professors!inner(user_id))`
    )
    .eq("course_offerings.offering_professors.user_id", professorId)
    .neq("status", "CANCELLED")

  if (error) {
    return []
  }

  const byUser = new Map<string, ProfessorStudent>()
  for (const row of data ?? []) {
    const existing = byUser.get(row.user_id)
    const edition = row.course_offerings?.name
    if (existing) {
      if (edition && !existing.editions.includes(edition)) existing.editions.push(edition)
      continue
    }
    byUser.set(row.user_id, {
      userId: row.user_id,
      firstName: row.profiles?.first_name ?? "",
      lastName: row.profiles?.last_name ?? "",
      editions: edition ? [edition] : [],
    })
  }

  return [...byUser.values()].sort((a, b) =>
    `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, "es")
  )
}
