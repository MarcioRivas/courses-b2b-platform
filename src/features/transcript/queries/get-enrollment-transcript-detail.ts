import { createClient } from "@/lib/supabase/server"
import type { ActivityKind, EnrollmentTranscriptDetail } from "../types"

/**
 * Assessments + activity + pending items of one enrollment, in parallel.
 * Each RPC re-checks `can_view_enrollment`; `null` means "not visible or failed".
 */
export async function getEnrollmentTranscriptDetail(enrollmentId: string): Promise<EnrollmentTranscriptDetail | null> {
  const supabase = await createClient()

  const [assessments, activity, pending] = await Promise.all([
    supabase.rpc("staff_enrollment_assessments", { p_enrollment: enrollmentId }),
    supabase.rpc("staff_enrollment_activity", { p_enrollment: enrollmentId }),
    supabase.rpc("staff_enrollment_pending", { p_enrollment: enrollmentId }),
  ])

  if (assessments.error || activity.error || pending.error) {
    return null
  }

  return {
    assessments: (assessments.data ?? []).map((a) => ({
      assessmentId: a.assessment_id,
      title: a.title,
      kind: a.kind,
      maxAttempts: a.max_attempts,
      availableUntil: a.available_until,
      attemptsUsed: a.attempts_used,
      lastAttemptId: a.last_attempt_id,
      lastStatus: a.last_status,
      scorePercent: a.score_percent === null ? null : Number(a.score_percent),
      scoreLabel: a.score_label,
      passed: a.passed,
    })),
    activity: (activity.data ?? []).map((a) => ({
      kind: a.kind as ActivityKind,
      occurredAt: a.occurred_at,
      moduleTitle: a.module_title,
      lessonTitle: a.lesson_title,
      itemTitle: a.item_title,
      scoreLabel: a.score_label,
      passed: a.passed,
    })),
    pending: (pending.data ?? []).map((p) => ({
      kind: p.kind === "ASSESSMENT" ? "ASSESSMENT" : "BLOCK",
      moduleTitle: p.module_title,
      lessonTitle: p.lesson_title,
      itemTitle: p.item_title,
      itemKind: p.item_kind,
    })),
  }
}
