import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { MyTaskSubmission, TaskSubmissionFile } from "../types"

/**
 * The caller's own submission for a TASK, or null when they have not
 * submitted. Students have no direct SELECT on attempts, so this goes through
 * the owner-only `my_task_submission` RPC, which masks score, label, passed
 * and feedback until the submission is GRADED.
 */
export async function getMyTaskSubmission(assessmentId: string, enrollmentId: string): Promise<MyTaskSubmission | null> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("my_task_submission", {
    p_assessment: assessmentId,
    p_enrollment: enrollmentId,
  })

  const row = data?.[0]
  if (error || !row) {
    return null
  }

  return {
    attemptId: row.attempt_id,
    status: row.status,
    submittedAt: row.submitted_at,
    submittedLate: row.submitted_late,
    scorePercent: row.score_percent,
    scoreLabel: row.score_label,
    passed: row.passed,
    feedback: row.feedback,
    files: Array.isArray(row.files) ? (row.files as unknown as TaskSubmissionFile[]) : [],
  }
}
