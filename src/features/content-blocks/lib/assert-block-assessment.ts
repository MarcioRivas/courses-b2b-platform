import { createClient } from "@/lib/supabase/server"

/**
 * A QUIZ/TASK block may only point at an assessment of the matching kind in
 * the same course (Phase 5 step 3) — the DB CHECK only guarantees
 * `assessment_id is not null`, not that it's the right course or kind.
 */
export async function assertBlockAssessmentMatchesCourse(
  assessmentId: string,
  courseId: string,
  blockType: "QUIZ" | "TASK"
): Promise<boolean> {
  const supabase = await createClient()

  const { data } = await supabase
    .from("assessments")
    .select("id")
    .eq("id", assessmentId)
    .eq("course_id", courseId)
    .eq("kind", blockType)
    .maybeSingle()

  return data !== null
}
