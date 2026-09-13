import { createClient } from "@/lib/supabase/server"
import type { EnrollmentBuckets, StudentEnrollment } from "../types"

/**
 * Every enrollment of the signed-in student in one round trip, grouped in TS
 * rather than in four queries (phase-04: dashboard ≤2 DB round trips, the
 * second being the org settings read for the timezone).
 *
 * Reads through `my_enrollment_summaries` rather than embedding `courses`,
 * because an ARCHIVED course fails `student_can_view_course` and the embed
 * would come back NULL — silently erasing a finished course from the student's
 * own history. The RPC is scoped to `auth.uid()` and still honours D29.
 */
export async function listMyEnrollments(): Promise<EnrollmentBuckets> {
  const supabase = await createClient()

  const { data } = await supabase.rpc("my_enrollment_summaries")

  const buckets: EnrollmentBuckets = {
    assigned: { active: [], finished: [] },
    free: { active: [], finished: [] },
  }

  for (const row of data ?? []) {
    const enrollment: StudentEnrollment = {
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
    }

    const group = row.source === "FREE_COURSE" ? buckets.free : buckets.assigned
    const shelf = row.status === "COMPLETED" ? group.finished : group.active
    shelf.push(enrollment)
  }

  return buckets
}
