import { createClient } from "@/lib/supabase/server"
import type { OrgGroupOption } from "../types"

/** Full group list for the offering form's group select — orgs are small enough for MVP (no pagination). */
export async function listOrgGroups(organizationId: string): Promise<OrgGroupOption[]> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("groups")
    .select("id, name")
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })

  if (error) {
    return []
  }

  return data ?? []
}
