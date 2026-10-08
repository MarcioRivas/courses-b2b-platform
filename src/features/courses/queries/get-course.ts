import { createClient } from "@/lib/supabase/server"
import type { CourseCompleteness, CourseDetail } from "../types"

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

  // FREE courses live in their OPEN edition only; PRIVATE courses count any edition.
  const { data: course } = await supabase.from("courses").select("access_type").eq("id", courseId).maybeSingle()
  let offerings = supabase.from("course_offerings").select("id").eq("course_id", courseId)
  if (course?.access_type === "FREE") {
    offerings = offerings.eq("kind", "OPEN")
  }
  const { data: offeringRows } = await offerings
  const offeringIds = (offeringRows ?? []).map((o) => o.id)

  const { data: modules } = offeringIds.length
    ? await supabase.from("modules").select("id").in("offering_id", offeringIds)
    : { data: [] as { id: string }[] }
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
