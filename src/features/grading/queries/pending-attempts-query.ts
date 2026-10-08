import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import type { GradingStatusGroup } from "../types"

export const PENDING_ATTEMPTS_PAGE_SIZE = 20

const PENDING_STATUSES = ["SUBMITTED", "AUTO_SUBMITTED"] as const
const GRADED_STATUSES = ["GRADED"] as const

export interface PendingAttemptsFilters {
  statusGroup: GradingStatusGroup
  courseId?: string
  assessmentId?: string
  offeringId?: string
  page: number
}

/**
 * Pure query builder over `assessment_attempts`, extracted so it can be
 * exercised with any `SupabaseClient<Database>` — the professor-scoped
 * cookie client in production, a test user's client in integration tests
 * (tests/integration/grading-ui-queries.test.ts).
 *
 * RLS (`assessment_attempts_select`: `is_org_admin` OR `is_offering_professor` of the enrollment)
 * is what actually scopes rows to the caller's courses; this only shapes the
 * select/filter/order/range. SUBMITTED and AUTO_SUBMITTED both still need
 * manual grading whenever the assessment has an OPEN_ENDED question —
 * `finalize_attempt` only reaches GRADED once every open answer is scored.
 * A TASK submission only enters the pending queue once its deadline has
 * passed: `grade_task_submission` refuses it before that, and students may
 * still replace it.
 */
export function buildPendingAttemptsQuery(
  supabase: SupabaseClient<Database>,
  filters: PendingAttemptsFilters
) {
  const statuses = filters.statusGroup === "GRADED" ? GRADED_STATUSES : PENDING_STATUSES
  const from = (filters.page - 1) * PENDING_ATTEMPTS_PAGE_SIZE
  const to = from + PENDING_ATTEMPTS_PAGE_SIZE - 1

  let query = supabase
    .from("assessment_attempts")
    .select(
      `id, status, submitted_at, attempt_number, submitted_late,
       profiles(first_name, last_name),
       assessments!inner(id, title, kind, course_id, available_until, courses(id, title)),
       course_enrollments!inner(offering_id)`,
      { count: "exact" }
    )
    .in("status", statuses)
    // Oldest submission first (D15); nulls (should not occur for these
    // statuses) sort last so a data anomaly cannot hide at the front.
    .order("submitted_at", { ascending: true, nullsFirst: false })
    .order("id", { ascending: true })
    .range(from, to)

  if (filters.statusGroup === "PENDING") {
    query = query.or(`kind.neq.TASK,available_until.lte.${new Date().toISOString()}`, {
      referencedTable: "assessments",
    })
  }
  if (filters.courseId) {
    query = query.eq("assessments.course_id", filters.courseId)
  }
  if (filters.offeringId) {
    query = query.eq("course_enrollments.offering_id", filters.offeringId)
  }
  if (filters.assessmentId) {
    query = query.eq("assessment_id", filters.assessmentId)
  }

  return query
}
