import { createClient } from "@/lib/supabase/server"
import type { GradableAssessmentOption } from "../types"

/**
 * Assessment options for the queue's filter dropdown, scoped to the given
 * course ids (the caller's own gradable courses — RLS `assessments_select`
 * grants read access to the same set independently, this is belt and braces).
 */
export async function listGradableAssessments(courseIds: string[]): Promise<GradableAssessmentOption[]> {
  if (courseIds.length === 0) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("assessments")
    .select("id, title, offering_id, course_offerings!inner(course_id, name)")
    .in("course_offerings.course_id", courseIds)
    .order("title", { ascending: true })

  if (error) {
    return []
  }

  return (data ?? []).map((row) => ({ id: row.id, title: row.title, courseId: row.course_offerings.course_id,
    offeringId: row.offering_id,
    offeringName: row.course_offerings.name,
  }))
}
