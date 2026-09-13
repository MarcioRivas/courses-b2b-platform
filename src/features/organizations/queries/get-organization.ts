import { createClient } from "@/lib/supabase/server"
import type { OrganizationSummary } from "../types"

/** RLS-scoped read: `organizations` SELECT policy already limits this to members. */
export async function getOrganization(organizationId: string): Promise<OrganizationSummary | null> {
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("organizations")
    .select("id, name, status")
    .eq("id", organizationId)
    .maybeSingle()

  if (error || !data) {
    return null
  }

  return data
}
