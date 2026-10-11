import { randomUUID } from "node:crypto"
import type { TestUser } from "./make-user"
import { supabaseAdmin } from "./supabase-admin"

export interface SubmittedAttempt {
  attemptId: string
  questions: { id: string; type: "MULTIPLE_CHOICE" | "OPEN_ENDED"; position: number }[]
}

/**
 * Starts an attempt as the student, heartbeats, answers every OPEN_ENDED
 * question with text (MC questions stay unanswered: they score 0) and submits.
 * Real RPCs throughout; only the question listing is read with the service role.
 */
export async function submitOpenAttempt(
  student: TestUser,
  enrollmentId: string,
  assessmentId: string
): Promise<SubmittedAttempt> {
  const { data: attemptId, error } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: assessmentId,
  })
  if (error || !attemptId) throw error ?? new Error("attempt not started")

  const session = randomUUID()
  await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })

  const { data: questions } = await supabaseAdmin
    .from("assessment_attempt_questions")
    .select("id, type, position")
    .eq("attempt_id", attemptId)
    .order("position")

  const rows = (questions ?? []) as SubmittedAttempt["questions"]
  const answers = rows
    .filter((q) => q.type === "OPEN_ENDED")
    .map((q, i) => ({ attempt_question_id: q.id, text_answer: `respuesta ${i + 1}`, client_seq: i + 1 }))

  const { error: submitError } = await student.client.rpc("submit_attempt", {
    p_attempt: attemptId,
    p_session: session,
    p_answers: answers,
  })
  if (submitError) throw submitError

  return { attemptId, questions: rows }
}
