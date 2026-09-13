import { createClient } from "@/lib/supabase/server"
import type { ProfessorCourseListItem } from "../types"

/**
 * `/teach/courses`: RLS (`is_course_professor`) already scopes `courses` to
 * this professor's assigned courses, so no extra filtering is needed here —
 * a plain `course_professors` join just orders the result.
 */
export async function listProfessorCourses(userId: string): Promise<ProfessorCourseListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("course_professors")
    .select("assigned_at, courses(id, title, status, access_type)")
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false })

  if (error) {
    return []
  }

  return (data ?? [])
    .filter((row) => row.courses !== null)
    .map((row) => ({
      id: row.courses!.id,
      title: row.courses!.title,
      status: row.courses!.status,
      accessType: row.courses!.access_type,
    }))
}
