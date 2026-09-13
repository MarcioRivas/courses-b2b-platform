import { createClient } from "@/lib/supabase/server"
import { likePattern } from "@/lib/db/like-pattern"
import type { CourseListItem, CourseStatus } from "../types"

const PAGE_SIZE = 25

interface ListCoursesParams {
  organizationId: string
  page: number
  q?: string
  status?: CourseStatus
}

interface ListCoursesResult {
  items: CourseListItem[]
  total: number
}

export async function listCourses({
  organizationId,
  page,
  q,
  status,
}: ListCoursesParams): Promise<ListCoursesResult> {
  const supabase = await createClient()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from("courses")
    .select("id, title, status, access_type", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: true })
    .range(from, to)

  if (q) {
    query = query.ilike("title", likePattern(q))
  }
  if (status) {
    query = query.eq("status", status)
  }

  const { data, error, count } = await query

  if (error) {
    return { items: [], total: 0 }
  }

  return {
    items: (data ?? []).map((course) => ({
      id: course.id,
      title: course.title,
      status: course.status,
      accessType: course.access_type,
    })),
    total: count ?? 0,
  }
}

export { PAGE_SIZE as COURSES_PAGE_SIZE }
