import { createClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/errors"
import { likePattern } from "@/lib/db/like-pattern"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import type { AuditLogListResult } from "../types"

export const AUDIT_LOGS_PAGE_SIZE = 50

export interface ListAuditLogsParams {
  /** Omitted only for a platform admin viewing every organization. RLS still
   *  scopes an org admin to their own org even if this were left unset. */
  organizationId?: string
  actor?: string
  action?: string
  entityType?: string
  /** Inclusive, `YYYY-MM-DD`, interpreted as UTC day boundaries. */
  from?: string
  to?: string
  page?: number
}

/**
 * Resolves user ids whose name matches `term`, scoped to `organizationId`
 * when given — mirrors `findMatchingUserIds` in `list-members.ts` but only
 * needs `profiles` (the audit actor is always a member, never looked up by
 * email/DNI here).
 */
async function findMatchingActorIds(
  supabase: SupabaseClient<Database>,
  term: string
): Promise<Set<string>> {
  const pattern = likePattern(term)
  const [byFirst, byLast] = await Promise.all([
    supabase.from("profiles").select("id").ilike("first_name", pattern),
    supabase.from("profiles").select("id").ilike("last_name", pattern),
  ])

  const ids = new Set<string>()
  for (const row of byFirst.data ?? []) ids.add(row.id)
  for (const row of byLast.data ?? []) ids.add(row.id)
  return ids
}

/**
 * Audit log directory. Runs as the calling user (never service role): RLS
 * (`audit_logs_select`, D28) already restricts rows to the caller's own org
 * (org admin) or every org (platform admin) — every filter here only narrows
 * further, never widens (D25).
 */
export async function listAuditLogs(params: ListAuditLogsParams): Promise<AuditLogListResult> {
  const supabase = await createClient()
  const page = params.page && params.page > 0 ? params.page : 1
  const from = (page - 1) * AUDIT_LOGS_PAGE_SIZE
  const to = from + AUDIT_LOGS_PAGE_SIZE - 1

  const term = params.actor?.trim()
  let matchingActorIds: string[] | null = null
  if (term) {
    const ids = await findMatchingActorIds(supabase, term)
    if (ids.size === 0) {
      return { items: [], total: 0, page, pageSize: AUDIT_LOGS_PAGE_SIZE }
    }
    matchingActorIds = Array.from(ids)
  }

  let query = supabase
    .from("audit_logs")
    .select(
      `id, organization_id, actor_user_id, action, entity_type, entity_id, metadata, created_at,
       organizations(name),
       actor:profiles!audit_logs_actor_user_id_fkey(first_name, last_name)`,
      { count: "exact" }
    )
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })

  if (params.organizationId) {
    query = query.eq("organization_id", params.organizationId)
  }
  if (params.action) {
    query = query.eq("action", params.action)
  }
  if (params.entityType) {
    query = query.eq("entity_type", params.entityType)
  }
  if (params.from) {
    query = query.gte("created_at", `${params.from}T00:00:00.000Z`)
  }
  if (params.to) {
    query = query.lte("created_at", `${params.to}T23:59:59.999Z`)
  }
  if (matchingActorIds) {
    query = query.in("actor_user_id", matchingActorIds)
  }

  const { data, error, count } = await query.range(from, to)

  if (error) {
    throw new AppError("INTERNAL", "No se pudo cargar el registro de auditoría.")
  }

  const items = (data ?? []).map((row) => ({
    id: row.id,
    organizationId: row.organization_id,
    organizationName: row.organizations?.name ?? null,
    actorUserId: row.actor_user_id,
    actorName: row.actor ? `${row.actor.first_name} ${row.actor.last_name}`.trim() : null,
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id,
    metadata: row.metadata,
    createdAt: row.created_at,
  }))

  return { items, total: count ?? 0, page, pageSize: AUDIT_LOGS_PAGE_SIZE }
}
