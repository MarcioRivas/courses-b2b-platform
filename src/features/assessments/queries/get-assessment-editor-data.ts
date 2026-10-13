import { createClient } from "@/lib/supabase/server"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import type { AssessmentEditorData, AssessmentWizardContext } from "../types"

/** PostgREST returns a one-to-one embed as an object, older shapes as an array. */
function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value ?? null
}

/**
 * Everything the wizard edits for one assessment, answer keys included.
 * Staff-only by RLS: students have no policy on `questions`/`question_options`.
 */
export async function getAssessmentEditorData(assessmentId: string): Promise<AssessmentEditorData | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("assessments")
    .select(
      `id, offering_id, kind, status, title, description, passing_score, max_attempts,
       duration_seconds, available_from, available_until, instructions, max_files,
       allow_late_submissions, random_question_count,
       lesson_content_blocks ( is_required ),
       questions ( id, type, prompt, points, position, question_options ( label, is_correct, position ) )`
    )
    .eq("id", assessmentId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

  return {
    id: data.id,
    offeringId: data.offering_id,
    kind: data.kind,
    status: data.status,
    title: data.title,
    description: data.description,
    passingScore: data.passing_score,
    maxAttempts: data.max_attempts,
    durationSeconds: data.duration_seconds,
    availableFrom: data.available_from,
    availableUntil: data.available_until,
    instructions: data.instructions,
    maxFiles: data.max_files,
    allowLateSubmissions: data.allow_late_submissions,
    randomQuestionCount: data.random_question_count,
    isRequired: firstOf(data.lesson_content_blocks)?.is_required ?? null,
    questions: [...(data.questions ?? [])].sort(byPosition).map((question) => ({
      id: question.id,
      type: question.type,
      prompt: question.prompt,
      points: Number(question.points),
      options: [...(question.question_options ?? [])]
        .sort(byPosition)
        .map((option) => ({ label: option.label, isCorrect: option.is_correct })),
    })),
  }
}

export async function getAssessmentWizardContext(organizationId: string): Promise<AssessmentWizardContext> {
  const settings = await getOrgSettings(organizationId)
  return {
    timeZone: settings?.timezone ?? DEFAULT_TIME_ZONE,
    defaultPassingScore: settings?.defaultPassingScore ?? 60,
  }
}
