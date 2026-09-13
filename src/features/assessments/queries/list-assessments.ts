import { createClient } from "@/lib/supabase/server"
import type { AssessmentKind } from "../types"
import type { AssessmentListItem, AssessmentPickerOption } from "../types"

/** RLS (`assessments_select`) scopes this to assessments the caller can edit or view. */
export async function listAssessments(courseId: string): Promise<AssessmentListItem[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("assessments")
    .select("id, title, kind, status, random_question_count, assessment_questions(count)")
    .eq("course_id", courseId)
    .order("created_at", { ascending: false })

  if (error) {
    return []
  }

  return (data ?? []).map((assessment) => ({
    id: assessment.id,
    title: assessment.title,
    kind: assessment.kind,
    status: assessment.status,
    questionCount: assessment.assessment_questions?.[0]?.count ?? 0,
    randomQuestionCount: assessment.random_question_count,
  }))
}

/**
 * Picker source for the content-block editor (QUIZ/TASK) and the module
 * dependency editor (QUIZ_PASSED): assessments of one kind in this course,
 * any status — a DRAFT assessment can still be wired up before publishing.
 */
export async function listAssessmentsForPicker(courseId: string, kind: AssessmentKind): Promise<AssessmentPickerOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("assessments")
    .select("id, title, status")
    .eq("course_id", courseId)
    .eq("kind", kind)
    .order("title", { ascending: true })

  if (error) {
    return []
  }

  return data ?? []
}
