import { createClient } from "@/lib/supabase/server"
import type { Json } from "@/types/database.types"

interface LogAuditParams {
  organizationId: string
  action: string
  entityType: string
  entityId?: string
  metadata?: Json
}

/**
 * Writes an audit trail entry. Calls the `log_audit` RPC only — never inserts
 * directly (D28).
 *
 * Never throws. Every caller runs this *after* its mutation has committed, so
 * throwing would surface the error boundary on an action that already
 * succeeded and invite a retry that writes twice. A failure is logged
 * server-side and reported in the return value instead.
 */
export async function logAudit({
  organizationId,
  action,
  entityType,
  entityId,
  metadata,
}: LogAuditParams): Promise<{ logged: boolean }> {
  const supabase = await createClient()

  const { error } = await supabase.rpc("log_audit", {
    p_org: organizationId,
    p_action: action,
    p_entity_type: entityType,
    p_entity_id: entityId,
    p_metadata: metadata ?? {},
  })

  if (error) {
    console.error(`logAudit failed for ${action} on ${entityType} ${entityId ?? "-"}: ${error.message}`)
    return { logged: false }
  }

  return { logged: true }
}
