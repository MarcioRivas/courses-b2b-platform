import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Thin wrapper over the `can_edit_course_content` SQL function — the single authority
 * for who may author course content (D22/D34).
 *
 * Deliberately not a TypeScript re-implementation of the rule: the same
 * function backs every RLS policy on modules, lessons and content blocks, so a
 * second copy here could drift and quietly disagree with the database.
 */
export async function canEditCourse(courseId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("can_edit_course_content", { p_course: courseId })

  if (error) {
    return false
  }

  return data === true
}
