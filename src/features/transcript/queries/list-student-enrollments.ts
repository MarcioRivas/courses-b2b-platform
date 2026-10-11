import { createClient } from "@/lib/supabase/server"
import type { StudentEnrollment } from "../types"

/**
 * Enrollments of `userId` the caller may view (`staff_student_enrollments`):
 * an admin sees all of the org's, a professor only their editions, anyone
 * else gets an empty list (no existence oracle).
 */
export async function listStudentEnrollments(userId: string): Promise<StudentEnrollment[]> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("staff_student_enrollments", { p_user: userId })

  if (error) {
    return []
  }

  return (data ?? []).map((row) => ({
    enrollmentId: row.enrollment_id,
    offeringId: row.offering_id,
    courseId: row.course_id,
    courseTitle: row.course_title,
    offeringLabel: row.offering_label,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    status: row.enrollment_status,
    enrolledAt: row.enrolled_at,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    progressPercent: Number(row.progress_percent),
    completedBlocks: row.completed_blocks,
    totalBlocks: row.total_blocks,
  }))
}
