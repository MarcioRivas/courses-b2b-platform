import "server-only"

import { createClient } from "@/lib/supabase/server"
import type { AttemptStatus, TaskSubmissionFile } from "../types"

export interface TaskSubmissionForGrading {
  attemptId: string
  status: AttemptStatus
  submittedAt: string | null
  submittedLate: boolean
  studentName: string
  assessmentTitle: string
  courseTitle: string
  instructions: string | null
  availableUntil: string | null
  scorePercent: number | null
  scoreLabel: string | null
  feedback: string | null
  files: TaskSubmissionFile[]
}

/**
 * One TASK submission for the grader. RLS (`assessment_attempts_select`,
 * `assessment_submission_files_select` = `can_grade_attempt`) scopes both
 * reads to courses this professor may grade; null means "not found or not
 * visible" and the page renders 404.
 */
export async function getTaskSubmissionForGrading(attemptId: string): Promise<TaskSubmissionForGrading | null> {
  const supabase = await createClient()

  const [{ data: attempt, error }, { data: files }] = await Promise.all([
    supabase
      .from("assessment_attempts")
      .select(
        `id, status, submitted_at, submitted_late, score_percent, score_label,
         profiles(first_name, last_name),
         assessments(title, instructions, available_until, course_offerings(courses(title))),
         assessment_feedback(feedback)`
      )
      .eq("id", attemptId)
      .maybeSingle(),
    supabase
      .from("assessment_submission_files")
      .select("id, filename, mime_type, size_bytes")
      .eq("attempt_id", attemptId)
      .order("position", { ascending: true }),
  ])

  if (error || !attempt || !attempt.assessments) {
    return null
  }

  return {
    attemptId: attempt.id,
    status: attempt.status,
    submittedAt: attempt.submitted_at,
    submittedLate: attempt.submitted_late,
    studentName: attempt.profiles ? `${attempt.profiles.first_name} ${attempt.profiles.last_name}`.trim() : "—",
    assessmentTitle: attempt.assessments.title,
    courseTitle: attempt.assessments.course_offerings?.courses?.title ?? "—",
    instructions: attempt.assessments.instructions,
    availableUntil: attempt.assessments.available_until,
    scorePercent: attempt.score_percent,
    scoreLabel: attempt.score_label,
    feedback: attempt.assessment_feedback?.feedback ?? null,
    files: (files ?? []).map((file) => ({
      id: file.id,
      filename: file.filename,
      mimeType: file.mime_type,
      sizeBytes: file.size_bytes,
    })),
  }
}
