import { createClient } from "@/lib/supabase/server"
import type { Database } from "@/types/database.types"

export interface EnrollmentHeader {
  id: string
  courseId: string
  /** The edition the student is enrolled in: its content and evaluations. */
  offeringId: string
  courseTitle: string
  courseDescription: string | null
  offeringName: string
  endsAt: string | null
  status: Database["public"]["Enums"]["enrollment_status"]
  progressPercent: number
  completedBlocks: number
  totalBlocks: number
  /** The course is ARCHIVED or the offering CANCELLED: read-only from here. */
  closed: boolean
}

/**
 * Reads one enrollment for the course page header.
 *
 * Ownership is not re-implemented here: `my_enrollment_summaries` only ever
 * returns rows belonging to `auth.uid()` whose membership and organization are
 * still ACTIVE (D29), so a foreign id simply comes back empty and the page
 * renders "curso no disponible".
 */
export async function getEnrollment(enrollmentId: string): Promise<EnrollmentHeader | null> {
  const supabase = await createClient()

  const { data } = await supabase.rpc("my_enrollment_summaries", { p_enrollment: enrollmentId })
  const row = data?.[0]

  if (!row) {
    return null
  }

  return {
    id: row.enrollment_id,
    courseId: row.course_id,
    offeringId: row.offering_id,
    courseTitle: row.course_title,
    courseDescription: row.course_description,
    offeringName: row.offering_name,
    endsAt: row.ends_at,
    status: row.status,
    progressPercent: Number(row.progress_percent),
    completedBlocks: row.completed_blocks,
    totalBlocks: row.total_blocks,
    closed: row.course_status !== "PUBLISHED" || row.offering_status !== "ACTIVE",
  }
}
