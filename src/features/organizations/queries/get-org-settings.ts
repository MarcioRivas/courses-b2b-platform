import { createClient } from "@/lib/supabase/server"
import type { OrgSettings } from "../types"

/** RLS-scoped read: `organization_settings` SELECT policy limits this to org members. */
export async function getOrgSettings(organizationId: string): Promise<OrgSettings | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("organization_settings")
    .select("timezone, default_passing_score")
    .eq("organization_id", organizationId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return {
    timezone: data.timezone,
    defaultPassingScore: data.default_passing_score,
  }
}
