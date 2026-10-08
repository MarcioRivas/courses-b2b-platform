import { createClient } from "@/lib/supabase/server"

/**
 * A QUIZ/TASK block may only point at an assessment of the matching kind in
 * the same edition (Phase 5 step 3, B2) — the DB CHECK only guarantees
 * `assessment_id is not null`, not that it's the right edition or kind.
 */
export async function assertBlockAssessmentMatchesOffering(
  assessmentId: string,
  offeringId: string,
  blockType: "QUIZ" | "TASK"
): Promise<boolean> {
  const supabase = await createClient()

  const { data } = await supabase
    .from("assessments")
    .select("id")
    .eq("id", assessmentId)
    .eq("offering_id", offeringId)
    .eq("kind", blockType)
    .maybeSingle()

  return data !== null
}
