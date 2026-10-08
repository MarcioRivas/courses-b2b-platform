import { createClient } from "@/lib/supabase/server"

/** Editions the professor teaches, for the grading queue's "Edición" filter (RLS already scopes the rows). */
export async function listProfessorEditions(userId: string): Promise<{ id: string; name: string }[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("offering_professors")
    .select("course_offerings!inner(id, name)")
    .eq("user_id", userId)

  if (error) {
    return []
  }

  return (data ?? [])
    .flatMap((row) => (row.course_offerings ? [{ id: row.course_offerings.id, name: row.course_offerings.name }] : []))
    .sort((a, b) => a.name.localeCompare(b.name, "es"))
}
