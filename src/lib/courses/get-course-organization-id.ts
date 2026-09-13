import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Audit entries require an organization id; the course row is the only
 * authoritative source (never trust a client-supplied value, D25). Used by
 * every module/lesson/content-block Server Action, which only receive a
 * course/module/lesson/block id from the client.
 */
export async function getCourseOrganizationId(courseId: string): Promise<string> {
  const supabase = await createClient()
  const { data } = await supabase.from("courses").select("organization_id").eq("id", courseId).single()
  return data?.organization_id ?? ""
}
