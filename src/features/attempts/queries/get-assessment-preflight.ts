import { createClient } from "@/lib/supabase/server"
import type { AssessmentKind } from "../types"

export interface AssessmentPreflight {
  id: string
  courseId: string
  moduleId: string | null
  title: string
  description: string | null
  kind: AssessmentKind
  durationSeconds: number | null
  availableFrom: string | null
  availableUntil: string | null
  maxAttempts: number | null
  randomQuestionCount: number | null
}

/**
 * Reads one assessment for the pre-flight screen. RLS (`assessments_select`)
 * only lets a student see it when `status = 'PUBLISHED'` and they can view the
 * course — an unpublished or foreign assessment simply comes back `null`,
 * which the page treats as "not available" (D24-style: hide, don't leak).
 */
export async function getAssessmentPreflight(assessmentId: string): Promise<AssessmentPreflight | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("assessments")
    .select(
      "id, course_id, module_id, title, description, kind, duration_seconds, available_from, available_until, max_attempts, random_question_count"
    )
    .eq("id", assessmentId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    id: data.id,
    courseId: data.course_id,
    moduleId: data.module_id,
    title: data.title,
    description: data.description,
    kind: data.kind,
    durationSeconds: data.duration_seconds,
    availableFrom: data.available_from,
    availableUntil: data.available_until,
    maxAttempts: data.max_attempts,
    randomQuestionCount: data.random_question_count,
  }
}
