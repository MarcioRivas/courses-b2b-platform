"use server"

import { revalidatePath } from "next/cache"
import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { ActionResult } from "@/lib/errors"
import { messages } from "@/lib/messages/es"
import { gradeTaskSchema, type GradeTaskInput } from "../schemas/task-submission-schemas"
import { taskRpcErrorResult } from "../lib/task-submission-errors"

export interface GradeTaskResult {
  scorePercent: number | null
  scoreLabel: string | null
  passed: boolean | null
}

/**
 * Grades a TASK submission with one 0..100 score plus optional feedback.
 * `grade_task_submission` re-checks grader rights, the kind and that the
 * deadline has passed; re-grading an already GRADED submission is allowed.
 */
export async function gradeTask(input: GradeTaskInput): Promise<ActionResult<GradeTaskResult>> {
  const parsed = gradeTaskSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, code: "VALIDATION", message: parsed.error.issues[0]?.message ?? messages.errors.VALIDATION }
  }

  await requireOrgRole(["PROFESSOR"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("grade_task_submission", {
    p_attempt: parsed.data.attemptId,
    p_score: Number(parsed.data.score),
    // Always sent (empty clears earlier feedback when re-grading).
    p_feedback: parsed.data.feedback ?? "",
    p_submitted_at: parsed.data.submittedAt ?? undefined,
  })

  const row = data?.[0]
  if (error || !row) {
    return taskRpcErrorResult(error)
  }

  revalidatePath(`/teach/grading/${parsed.data.attemptId}`)
  revalidatePath("/teach/grading")

  return {
    ok: true,
    data: { scorePercent: row.score_percent, scoreLabel: row.score_label, passed: row.passed },
  }
}
