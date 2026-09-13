import { createClient } from "@/lib/supabase/server"
import type { FreeCourse } from "../types"

/**
 * PUBLISHED FREE courses of the caller's organization they are not enrolled in
 * yet. `courses_select` already hides DRAFT/ARCHIVED rows and other tenants, so
 * the filters here are narrowing, not authorising.
 */
export async function listFreeCourses(
  organizationId: string,
  userId: string
): Promise<FreeCourse[]> {
  const supabase = await createClient()

  const [{ data: courses }, { data: enrollments }] = await Promise.all([
    supabase
      .from("courses")
      .select("id, title, description")
      .eq("organization_id", organizationId)
      .eq("access_type", "FREE")
      .eq("status", "PUBLISHED")
      .order("title", { ascending: true }),
    supabase
      .from("course_enrollments")
      .select("course_id")
      .eq("user_id", userId)
      .neq("status", "CANCELLED"),
  ])

  const enrolled = new Set((enrollments ?? []).map((row) => row.course_id))

  return (courses ?? [])
    .filter((course) => !enrolled.has(course.id))
    .map((course) => ({ id: course.id, title: course.title, description: course.description }))
}
