import { createClient } from "@/lib/supabase/server"
import { actionMeta } from "../action-catalog"
import type { AuditActionOption } from "../types"

/**
 * Distinct actions actually present in scope, for the filter dropdown — a
 * shorter, more useful list than the full static catalog (an org that never
 * touched assessments shouldn't see 12 assessment.* options). Capped at 2000
 * rows: the action space itself is a few dozen strings (see
 * `action-catalog.ts`), so this is a distinct-in-JS pass over a small sample,
 * not a full-table scan pattern (D34 — boring, correct, no BI).
 */
export async function listAuditActions(organizationId?: string): Promise<AuditActionOption[]> {
  const supabase = await createClient()

  let query = supabase.from("audit_logs").select("action").order("action", { ascending: true }).limit(2000)
  if (organizationId) {
    query = query.eq("organization_id", organizationId)
  }

  const { data, error } = await query
  if (error) {
    return []
  }

  const seen = new Set<string>()
  const options: AuditActionOption[] = []
  for (const row of data ?? []) {
    if (seen.has(row.action)) continue
    seen.add(row.action)
    const meta = actionMeta(row.action)
    options.push({ action: row.action, label: meta.label, entityType: meta.entityType })
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, "es"))
}
