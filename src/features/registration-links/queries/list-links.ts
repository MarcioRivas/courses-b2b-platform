import { createClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/errors"
import type { LinkRole } from "../schemas/link-schemas"

export interface LinkListItem {
  id: string
  label: string | null
  defaultRole: LinkRole
  token: string
  isActive: boolean
  useCount: number
  maxUses: number | null
  expiresAt: string | null
  revokedAt: string | null
}

export interface ListLinksParams {
  organizationId: string
  page?: number
}

export interface ListLinksResult {
  items: LinkListItem[]
  total: number
  page: number
  pageSize: number
}

export const LINKS_PAGE_SIZE = 25

/**
 * Registration links for one organization. RLS already restricts SELECT to
 * `is_org_admin(organization_id)` (D27/D37) — non-admins never reach this
 * query path (the calling pages/components are admin-guarded), but the
 * `organization_id` filter is still the tenant boundary (D25).
 */
export async function listLinks(params: ListLinksParams): Promise<ListLinksResult> {
  const supabase = await createClient()
  const page = params.page && params.page > 0 ? params.page : 1
  const from = (page - 1) * LINKS_PAGE_SIZE
  const to = from + LINKS_PAGE_SIZE - 1

  const { data, error, count } = await supabase
    .from("organization_registration_links")
    .select("id, label, default_role, token, is_active, use_count, max_uses, expires_at, revoked_at", { count: "exact" })
    .eq("organization_id", params.organizationId)
    // `id` breaks ties: links created in one transaction share created_at, and
    // an unstable order makes range() duplicate or skip rows between pages.
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .range(from, to)

  if (error) {
    throw new AppError("INTERNAL", "No se pudo cargar la lista de links.")
  }

  const items: LinkListItem[] = (data ?? []).map((row) => ({
    id: row.id,
    label: row.label,
    defaultRole: row.default_role,
    token: row.token,
    isActive: row.is_active,
    useCount: row.use_count,
    maxUses: row.max_uses,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
  }))

  return { items, total: count ?? 0, page, pageSize: LINKS_PAGE_SIZE }
}
