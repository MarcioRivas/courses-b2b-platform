import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Audit entries need an organization id and cache invalidation needs the
 * course id; the edition row is the only authoritative source for both (never
 * trust a client-supplied value, D25). Content and evaluation Server Actions
 * only receive an edition / module / lesson / block id from the client.
 */
export async function getOfferingContext(
  offeringId: string
): Promise<{ organizationId: string; courseId: string } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("course_offerings")
    .select("organization_id, course_id")
    .eq("id", offeringId)
    .maybeSingle()

  return data ? { organizationId: data.organization_id, courseId: data.course_id } : null
}

export async function getOfferingOrganizationId(offeringId: string): Promise<string> {
  return (await getOfferingContext(offeringId))?.organizationId ?? ""
}
