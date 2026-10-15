import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import { buildPendingAttemptsQuery } from "../queries/pending-attempts-query"

/**
 * Size of the caller's "Pendientes" grading queue: the same query the
 * /teach/grading page lists (RLS scopes it to the professor's editions; TASK
 * submissions count only once their deadline passed). Works with the server
 * or the browser client. Never throws: 0 on error.
 */
export async function countPendingGrading(supabase: SupabaseClient<Database>): Promise<number> {
  try {
    const { count, error } = await buildPendingAttemptsQuery(supabase, { statusGroup: "PENDING", page: 1 })
    return error ? 0 : (count ?? 0)
  } catch {
    return 0
  }
}
