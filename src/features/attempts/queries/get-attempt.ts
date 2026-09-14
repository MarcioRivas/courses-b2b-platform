import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"
import type { AttemptQuestion, AttemptQuestionOption, AttemptSnapshot } from "../types"

function parseOptions(json: Json): AttemptQuestionOption[] {
  if (!Array.isArray(json)) {
    return []
  }

  const options: AttemptQuestionOption[] = []
  for (const item of json) {
    if (typeof item === "object" && item !== null && "id" in item && "label" in item) {
      const record = item as Record<string, unknown>
      options.push({ id: String(record.id), label: String(record.label) })
    }
  }
  return options
}

/**
 * The attempt as the student is allowed to see it: `attempt_header` (status,
 * timer sync) plus `student_attempt_view` (questions + own answers, scoring
 * only when GRADED — D24/F7). Never reads `assessment_attempts` directly.
 */
export async function getAttempt(attemptId: string): Promise<AttemptSnapshot | null> {
  const supabase = await createClient()

  const [{ data: headerRows }, { data: questionRows }] = await Promise.all([
    supabase.rpc("attempt_header", { p_attempt: attemptId }),
    supabase.rpc("student_attempt_view", { p_attempt: attemptId }),
  ])

  const headerRow = headerRows?.[0]
  if (!headerRow) {
    return null
  }

  const questions: AttemptQuestion[] = (questionRows ?? [])
    .map(
      (row): AttemptQuestion => ({
        attemptQuestionId: row.attempt_question_id,
        position: row.position,
        type: row.type,
        prompt: row.prompt,
        options: parseOptions(row.options),
        points: Number(row.points),
        selectedOptionId: row.selected_option_id,
        textAnswer: row.text_answer,
        clientSeq: row.client_seq,
        pointsAwarded: row.points_awarded === null ? null : Number(row.points_awarded),
        isCorrect: row.is_correct,
        feedback: row.feedback,
      })
    )
    .sort((a, b) => a.position - b.position)

  return {
    header: {
      attemptId: headerRow.attempt_id,
      assessmentId: headerRow.assessment_id,
      enrollmentId: headerRow.enrollment_id,
      status: headerRow.status,
      attemptNumber: headerRow.attempt_number,
      startedAt: headerRow.started_at,
      effectiveEndAt: headerRow.effective_end_at,
      activeSessionId: headerRow.active_session_id,
      serverNow: headerRow.server_now,
    },
    questions,
  }
}
