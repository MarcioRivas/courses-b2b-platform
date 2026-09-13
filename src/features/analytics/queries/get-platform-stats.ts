import { createClient } from "@/lib/supabase/server"
import { isBenignRpcError } from "../lib/rpc-error"
import type { PlatformOrgStatsRow, PlatformTotals } from "../types"

export interface PlatformStats {
  rows: PlatformOrgStatsRow[]
  totals: PlatformTotals
}

/**
 * Per-org rollup (`platform_org_stats` RPC, platform admin only) plus
 * platform totals summed here in the query layer, not inside the SQL
 * function (spec step 7 — one extra reduce, not an extra round trip).
 */
export async function getPlatformStats(): Promise<PlatformStats> {
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("platform_org_stats")
  if (error) {
    if (isBenignRpcError(error.code)) {
      return { rows: [], totals: { organizations: 0, students: 0, professors: 0, courses: 0, enrollments: 0, attempts: 0 } }
    }
    throw error
  }

  const rows: PlatformOrgStatsRow[] = (data ?? []).map((row) => ({
    organizationId: row.organization_id,
    name: row.name,
    status: row.status,
    studentsCount: Number(row.students_count),
    professorsCount: Number(row.professors_count),
    coursesCount: Number(row.courses_count),
    enrollmentsCount: Number(row.enrollments_count),
    attemptsCount: Number(row.attempts_count),
    avgProgressPercent: Number(row.avg_progress_percent),
  }))

  const totals = rows.reduce<PlatformTotals>(
    (acc, row) => ({
      organizations: acc.organizations + 1,
      students: acc.students + row.studentsCount,
      professors: acc.professors + row.professorsCount,
      courses: acc.courses + row.coursesCount,
      enrollments: acc.enrollments + row.enrollmentsCount,
      attempts: acc.attempts + row.attemptsCount,
    }),
    { organizations: 0, students: 0, professors: 0, courses: 0, enrollments: 0, attempts: 0 }
  )

  return { rows, totals }
}
