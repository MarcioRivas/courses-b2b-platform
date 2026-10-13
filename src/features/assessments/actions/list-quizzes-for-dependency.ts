"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditOffering } from "@/lib/auth/course-access"
import type { AssessmentPickerOption } from "../types"

/**
 * Read-only Server Action for the module dependency editor (QUIZ_PASSED): the
 * edition's quizzes, any status — a DRAFT quiz can be wired before publishing.
 * A server action because the editor is a nested client component.
 */
export async function listQuizzesForDependency(offeringId: string): Promise<AssessmentPickerOption[]> {
  await requireOrgRole(["ADMIN", "PROFESSOR"])
  if (!(await canEditOffering(offeringId))) {
    return []
  }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("assessments")
    .select("id, title, status")
    .eq("offering_id", offeringId)
    .eq("kind", "QUIZ")
    .order("title", { ascending: true })

  return error ? [] : (data ?? [])
}
