import { createClient } from "@/lib/supabase/server"
import type { CourseCompleteness, CourseDetail, CourseProfessor } from "../types"

/** RLS-scoped read: courses SELECT policy covers admin/professor/student visibility. */
export async function getCourse(courseId: string): Promise<CourseDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("courses")
    .select("id, organization_id, title, description, status, access_type, published_at, archived_at")
    .eq("id", courseId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    title: data.title,
    description: data.description,
    status: data.status,
    accessType: data.access_type,
    publishedAt: data.published_at,
    archivedAt: data.archived_at,
  }
}

/**
 * UX-only checklist for the publish dialog. `hasBlock` alone is exactly the
 * RPC's completeness condition (a block's lesson/module chain is guaranteed
 * by the foreign keys); the other two flags just help point at *which* step
 * is missing without a second round trip once the RPC has already refused.
 */
export async function getCourseCompleteness(courseId: string): Promise<CourseCompleteness> {
  const supabase = await createClient()

  const { data: modules } = await supabase.from("modules").select("id").eq("course_id", courseId)
  const moduleIds = (modules ?? []).map((m) => m.id)

  if (moduleIds.length === 0) {
    return { hasModule: false, hasLesson: false, hasBlock: false }
  }

  const { data: lessons } = await supabase.from("lessons").select("id").in("module_id", moduleIds)
  const lessonIds = (lessons ?? []).map((l) => l.id)

  if (lessonIds.length === 0) {
    return { hasModule: true, hasLesson: false, hasBlock: false }
  }

  const { count } = await supabase
    .from("lesson_content_blocks")
    .select("id", { count: "exact", head: true })
    .in("lesson_id", lessonIds)

  return { hasModule: true, hasLesson: true, hasBlock: (count ?? 0) > 0 }
}

/** Assigned professors of a course, name-sorted (small list, sort in memory like list-assignable-students). */
export async function getCourseProfessors(courseId: string): Promise<CourseProfessor[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("course_professors")
    .select("user_id, profiles!course_professors_user_id_fkey(first_name, last_name)")
    .eq("course_id", courseId)

  if (error) {
    return []
  }

  return (data ?? [])
    .map((row) => ({
      userId: row.user_id,
      firstName: row.profiles?.first_name ?? "",
      lastName: row.profiles?.last_name ?? "",
    }))
    .sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`, "es"))
}
