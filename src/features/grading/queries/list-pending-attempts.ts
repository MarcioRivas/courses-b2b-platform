import { createClient } from "@/lib/supabase/server"
import { buildPendingAttemptsQuery, PENDING_ATTEMPTS_PAGE_SIZE } from "./pending-attempts-query"
import type { GradingStatusGroup, PendingAttemptListItem } from "../types"

export { PENDING_ATTEMPTS_PAGE_SIZE }

export interface ListPendingAttemptsParams {
  statusGroup: GradingStatusGroup
  courseId?: string
  assessmentId?: string
  offeringId?: string
  page: number
}

export interface ListPendingAttemptsResult {
  items: PendingAttemptListItem[]
  total: number
}

/** Professor/admin grading queue (D15/B12). See `buildPendingAttemptsQuery` for the RLS scoping note. */
export async function listPendingAttempts(
  params: ListPendingAttemptsParams
): Promise<ListPendingAttemptsResult> {
  const supabase = await createClient()
  const { data, error, count } = await buildPendingAttemptsQuery(supabase, params)

  if (error) {
    return { items: [], total: 0 }
  }

  const items: PendingAttemptListItem[] = (data ?? []).flatMap((row) => {
    const assessment = row.assessments
    if (!assessment) {
      return []
    }

    return [
      {
        attemptId: row.id,
        status: row.status,
        submittedAt: row.submitted_at,
        attemptNumber: row.attempt_number,
        submittedLate: row.submitted_late,
        studentName: row.profiles ? `${row.profiles.first_name} ${row.profiles.last_name}`.trim() : "—",
        assessmentId: assessment.id,
        assessmentTitle: assessment.title,
        assessmentKind: assessment.kind,
        courseId: row.course_enrollments?.course_id ?? "",
        courseTitle: row.course_enrollments?.courses?.title ?? "—",
      },
    ]
  })

  return { items, total: count ?? 0 }
}
