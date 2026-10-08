import { createClient } from "@/lib/supabase/server"
import type { ProfessorCourseListItem } from "../types"

/**
 * `/teach/courses`: courses where this professor teaches at least one edition,
 * with the edition names. RLS (`offering_professors_select`) already limits the
 * rows to the caller's own assignments.
 */
export async function listProfessorCourses(userId: string): Promise<ProfessorCourseListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("offering_professors")
    .select("assigned_at, course_offerings!inner(name, courses!inner(id, title, status, access_type))")
    .eq("user_id", userId)
    .order("assigned_at", { ascending: false })

  if (error) {
    return []
  }

  const byCourse = new Map<string, ProfessorCourseListItem>()
  for (const row of data ?? []) {
    const offering = row.course_offerings
    const course = offering?.courses
    if (!offering || !course) continue
    const existing = byCourse.get(course.id)
    if (existing) {
      existing.editions.push(offering.name)
    } else {
      byCourse.set(course.id, {
        id: course.id,
        title: course.title,
        status: course.status,
        accessType: course.access_type,
        editions: [offering.name],
      })
    }
  }
  return Array.from(byCourse.values())
}
