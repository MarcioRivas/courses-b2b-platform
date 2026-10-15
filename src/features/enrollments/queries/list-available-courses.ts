import { createClient } from "@/lib/supabase/server"
import type { AvailableCourse } from "../types"

/**
 * FREE courses of the student's organization they can enroll in now. The RPC
 * enforces membership (another org's id returns nothing) and only lists
 * courses with an open, active edition, the one self-enroll would use.
 * Never throws: [] on error.
 */
export async function listAvailableCourses(organizationId: string): Promise<AvailableCourse[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("list_available_free_courses", { p_organization: organizationId })
  if (error) return []

  return (data ?? []).map((row) => ({
    id: row.course_id,
    title: row.title,
    description: row.description,
    moduleCount: row.module_count,
  }))
}
