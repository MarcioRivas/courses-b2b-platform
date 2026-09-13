import { createClient } from "@/lib/supabase/server"
import type { OrgStats } from "../types"

/** Admin dashboard counts via `head:true, count:'exact'` (no row transfer). */
export async function countOrgStats(organizationId: string): Promise<OrgStats> {
  const supabase = await createClient()
  const nowIso = new Date().toISOString()

  const [studentsRes, professorsRes, groupsRes, linksRes] = await Promise.all([
    supabase
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "STUDENT")
      .eq("status", "ACTIVE"),
    supabase
      .from("organization_memberships")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("role", "PROFESSOR")
      .eq("status", "ACTIVE"),
    supabase
      .from("groups")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("organization_registration_links")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("is_active", true)
      .is("revoked_at", null)
      .or(`expires_at.is.null,expires_at.gt.${nowIso}`),
  ])

  return {
    activeStudents: studentsRes.count ?? 0,
    professors: professorsRes.count ?? 0,
    groups: groupsRes.count ?? 0,
    activeLinks: linksRes.count ?? 0,
  }
}
