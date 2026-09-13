import { createClient } from "@/lib/supabase/server"

/**
 * True when a lesson content block or a module dependency already points at
 * this assessment (M3): the detail page uses this to lock the `kind` field
 * in the form even for a DRAFT assessment, mirroring `updateAssessment`'s
 * server-side guard.
 */
export async function isAssessmentReferenced(assessmentId: string): Promise<boolean> {
  const supabase = await createClient()

  const [{ count: blockCount }, { count: dependencyCount }] = await Promise.all([
    supabase.from("lesson_content_blocks").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId),
    supabase.from("module_dependencies").select("id", { count: "exact", head: true }).eq("assessment_id", assessmentId),
  ])

  return (blockCount ?? 0) > 0 || (dependencyCount ?? 0) > 0
}
