import { createClient } from "@/lib/supabase/server"
import type { StudentEnrollment } from "../types"

/**
 * Every non-cancelled enrollment of the signed-in student in one round trip.
 * The "Cursos" screen derives states, order and filters in TS
 * (see lib/student-course-list.ts).
 *
 * Reads through `my_enrollment_summaries` rather than embedding `courses`,
 * because an ARCHIVED course fails `student_can_view_course` and the embed
 * would come back NULL — silently erasing a finished course from the student's
 * own history. The RPC is scoped to `auth.uid()` and still honours D29.
 * CANCELLED enrollments are hidden: a cancelled FREE course shows again as
 * available, and enrolling reactivates it.
 */
export async function listMyEnrollments(): Promise<StudentEnrollment[]> {
  const supabase = await createClient()

  const { data } = await supabase.rpc("my_enrollment_summaries")

  return (data ?? [])
    .filter((row) => row.status !== "CANCELLED")
    .map((row) => ({
      id: row.enrollment_id,
      status: row.status,
      source: row.source,
      progressPercent: Number(row.progress_percent),
      completedBlocks: row.completed_blocks,
      totalBlocks: row.total_blocks,
      completedAt: row.completed_at,
      courseId: row.course_id,
      courseTitle: row.course_title,
      courseDescription: row.course_description,
      offeringName: row.offering_name,
      endsAt: row.ends_at,
      closed: row.course_status !== "PUBLISHED" || row.offering_status !== "ACTIVE",
      lastActivityAt: row.last_activity_at,
      resumeLessonId: row.resume_lesson_id,
    }))
}
