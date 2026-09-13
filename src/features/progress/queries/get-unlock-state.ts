import { createClient } from "@/lib/supabase/server"

export interface ModuleUnlockState {
  moduleId: string
  state: string
  /** Server-authored Spanish explanation (§53) — never re-derived in the UI. */
  reason: string
  availableFrom: string | null
  availableUntil: string | null
}

/**
 * Availability for every module of an enrollment, decided entirely server-side
 * (D17). Returns an empty list when the RPC refuses (foreign enrollment,
 * revoked membership) — the page then renders "curso no disponible".
 */
export async function getUnlockState(enrollmentId: string): Promise<ModuleUnlockState[]> {
  const supabase = await createClient()

  const { data, error } = await supabase.rpc("module_unlock_state", { p_enrollment: enrollmentId })

  if (error || !data) {
    return []
  }

  return data.map((row) => ({
    moduleId: row.module_id,
    state: row.state,
    reason: row.reason,
    availableFrom: row.available_from,
    availableUntil: row.available_until,
  }))
}
