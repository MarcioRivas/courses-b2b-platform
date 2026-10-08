import "server-only"

import { createClient } from "@/lib/supabase/server"

/**
 * Thin wrapper over the `can_edit_offering` SQL function — the single authority
 * for who may author an edition's content and evaluations (D22/D34): an org
 * admin or a professor assigned to THAT edition.
 *
 * Deliberately not a TypeScript re-implementation of the rule: the same
 * function backs every RLS policy on modules, lessons, content blocks and
 * assessments, so a second copy here could drift and quietly disagree with the
 * database.
 */
export async function canEditOffering(offeringId: string): Promise<boolean> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("can_edit_offering", { p_offering: offeringId })

  if (error) {
    return false
  }

  return data === true
}
