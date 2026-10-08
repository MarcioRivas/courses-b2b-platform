import { createClient } from "@/lib/supabase/server"
import type { AssessmentDetail } from "../types"

export async function getAssessment(assessmentId: string): Promise<AssessmentDetail | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("assessments")
    .select(
      `id, organization_id, course_id, module_id, kind, status, title, description,
       question_bank_id, random_question_count, duration_seconds, available_from, available_until,
       passing_score, max_attempts, instructions, max_files, allow_late_submissions,
       assessment_questions ( id, question_id, position, points, questions ( prompt, type ) )`
    )
    .eq("id", assessmentId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    id: data.id,
    organizationId: data.organization_id,
    courseId: data.course_id,
    moduleId: data.module_id,
    kind: data.kind,
    status: data.status,
    title: data.title,
    description: data.description,
    questionBankId: data.question_bank_id,
    randomQuestionCount: data.random_question_count,
    durationSeconds: data.duration_seconds,
    availableFrom: data.available_from,
    availableUntil: data.available_until,
    passingScore: data.passing_score,
    maxAttempts: data.max_attempts,
    instructions: data.instructions,
    maxFiles: data.max_files,
    allowLateSubmissions: data.allow_late_submissions,
    fixedQuestions: [...(data.assessment_questions ?? [])]
      .sort((a, b) => a.position - b.position)
      .map((row) => ({
        id: row.id,
        questionId: row.question_id,
        position: row.position,
        points: Number(row.points),
        prompt: row.questions?.prompt ?? "",
        type: row.questions?.type ?? "OPEN_ENDED",
      })),
  }
}
