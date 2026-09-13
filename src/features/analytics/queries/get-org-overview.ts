import { createClient } from "@/lib/supabase/server"
import { isBenignRpcError } from "../lib/rpc-error"
import type { OrgOverviewStats } from "../types"

/**
 * Org admin dashboard summary (`org_overview_stats` RPC). The function
 * asserts `is_org_admin(p_org) or is_platform_admin()` first (D25) — a
 * `null` return here means the caller lacked access (42501) or the org has
 * no rows, both of which the page treats as "nothing to show". Any other
 * error is rethrown (M1) so the page shows `ErrorState` instead of hiding data.
 */
export async function getOrgOverview(organizationId: string): Promise<OrgOverviewStats | null> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("org_overview_stats", { p_org: organizationId })
  if (error) {
    if (isBenignRpcError(error.code)) {
      return null
    }
    throw error
  }

  const row = data?.[0]
  if (!row) {
    return null
  }

  return {
    studentsTotal: Number(row.students_total),
    studentsActive: Number(row.students_active),
    studentsWithEnrollment: Number(row.students_with_enrollment),
    studentsCompletedCourse: Number(row.students_completed_course),
    professorsTotal: Number(row.professors_total),
    professorsActive: Number(row.professors_active),
    adminsActive: Number(row.admins_active),
    coursesDraft: Number(row.courses_draft),
    coursesPublished: Number(row.courses_published),
    coursesArchived: Number(row.courses_archived),
    attemptsInProgress: Number(row.attempts_in_progress),
    attemptsSubmitted: Number(row.attempts_submitted),
    attemptsAutoSubmitted: Number(row.attempts_auto_submitted),
    attemptsGraded: Number(row.attempts_graded),
  }
}
