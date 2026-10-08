"use server"

import { createClient } from "@/lib/supabase/server"
import { requireOrgRole } from "@/lib/auth/require-role"
import { toActionError, type ActionResult } from "@/lib/errors"
import {
  searchAssignableProfessorsSchema,
  type SearchAssignableProfessorsInput,
} from "../schemas/offering-schemas"
import type { AssignableProfessor } from "../types"

/** Picker search: the RPC enforces admin-only, escaping, exclusion of assigned professors and `limit 3`. */
export async function searchAssignableProfessors(
  input: SearchAssignableProfessorsInput
): Promise<ActionResult<AssignableProfessor[]>> {
  const parsed = searchAssignableProfessorsSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: true, data: [] }
  }

  await requireOrgRole(["ADMIN"])
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("search_assignable_professors", {
    p_offering: parsed.data.offeringId,
    p_q: parsed.data.q,
  })

  if (error) {
    return { ok: false, ...toActionError(error) }
  }

  return {
    ok: true,
    data: (data ?? []).map((row) => ({ userId: row.user_id, fullName: row.full_name, email: row.email })),
  }
}
