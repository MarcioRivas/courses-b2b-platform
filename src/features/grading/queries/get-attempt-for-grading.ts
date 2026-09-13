import { createClient } from "@/lib/supabase/server"
import type { AttemptForGrading, AttemptQuestionForGrading } from "../types"

interface OptionShape {
  id: string
  label: string
}

/** `options` is jsonb `[{id,label}]` (never `is_correct` — C8); shape asserted, not re-validated. */
function toOptions(value: unknown): OptionShape[] {
  return Array.isArray(value) ? (value as OptionShape[]) : []
}

/**
 * One attempt's full grading view: header (student, assessment, course,
 * totals) + every snapshot question, MC auto-graded and read-only, OPEN_ENDED
 * carrying the student's answer and the current grade if any.
 *
 * RLS (`can_view_attempt` / `assessment_attempts_select`) already scopes both
 * reads to attempts of courses this professor/admin may grade — a `null`
 * return here means "not found or not visible", and the caller renders 404.
 */
export async function getAttemptForGrading(attemptId: string): Promise<AttemptForGrading | null> {
  const supabase = await createClient()

  const [{ data: attempt, error: attemptError }, { data: questions, error: questionsError }] = await Promise.all([
    supabase
      .from("assessment_attempts")
      .select(
        `id, status, attempt_number, submitted_at, auto_score, manual_score, total_score, max_score,
         score_percent, score_label, passed,
         profiles(first_name, last_name),
         assessments(id, title, kind, course_id, courses(id, title)),
         assessment_feedback(feedback)`
      )
      .eq("id", attemptId)
      .maybeSingle(),
    supabase
      .from("assessment_attempt_questions")
      .select(
        `id, position, type, prompt, points, selected_option_id, text_answer, options,
         assessment_grades(points_awarded, feedback, is_correct, graded_by)`
      )
      .eq("attempt_id", attemptId)
      .order("position", { ascending: true }),
  ])

  if (attemptError || !attempt || !attempt.assessments || questionsError) {
    return null
  }

  const mappedQuestions: AttemptQuestionForGrading[] = (questions ?? []).map((question) => {
    const grade = question.assessment_grades?.[0] ?? null

    return {
      attemptQuestionId: question.id,
      position: question.position,
      type: question.type,
      prompt: question.prompt,
      points: question.points,
      selectedOptionId: question.selected_option_id,
      textAnswer: question.text_answer,
      options: toOptions(question.options),
      pointsAwarded: grade?.points_awarded ?? null,
      isCorrect: grade?.is_correct ?? null,
      feedback: grade?.feedback ?? null,
      gradedBy: grade?.graded_by ?? null,
    }
  })

  return {
    attemptId: attempt.id,
    status: attempt.status,
    attemptNumber: attempt.attempt_number,
    submittedAt: attempt.submitted_at,
    studentName: attempt.profiles ? `${attempt.profiles.first_name} ${attempt.profiles.last_name}`.trim() : "—",
    assessmentId: attempt.assessments.id,
    assessmentTitle: attempt.assessments.title,
    assessmentKind: attempt.assessments.kind,
    courseId: attempt.assessments.course_id,
    courseTitle: attempt.assessments.courses?.title ?? "—",
    autoScore: attempt.auto_score,
    manualScore: attempt.manual_score,
    totalScore: attempt.total_score,
    maxScore: attempt.max_score,
    scorePercent: attempt.score_percent,
    scoreLabel: attempt.score_label,
    passed: attempt.passed,
    overallFeedback: attempt.assessment_feedback?.feedback ?? null,
    questions: mappedQuestions,
  }
}
