import { createClient } from "@/lib/supabase/server"
import { AppError } from "@/lib/errors"
import { likePattern } from "@/lib/db/like-pattern"
import type { SupabaseClient } from "@supabase/supabase-js"
import type { Database } from "@/types/database.types"
import type { MembershipRole, MembershipStatus } from "../schemas/user-schemas"

export interface MemberListItem {
  membershipId: string
  userId: string
  fullName: string
  role: MembershipRole
  status: MembershipStatus
  email: string | null
  dni: string | null
}

export interface ListMembersParams {
  organizationId: string
  role?: MembershipRole
  status?: MembershipStatus
  search?: string
  page?: number
}

export interface ListMembersResult {
  items: MemberListItem[]
  total: number
  page: number
  pageSize: number
}

export const MEMBERS_PAGE_SIZE = 25

/**
 * Resolves user ids matching `term` across `profiles` (name) and the
 * admin-only `profile_private` (email/DNI, D27). Four small ILIKE queries
 * instead of one cross-embed OR — simpler and correct at the ≤500 users/org
 * scale this directory is built for (see phase-02 risk table).
 */
async function findMatchingUserIds(
  supabase: SupabaseClient<Database>,
  term: string
): Promise<Set<string>> {
  const pattern = likePattern(term)
  const [byFirst, byLast, byEmail, byDni] = await Promise.all([
    supabase.from("profiles").select("id").ilike("first_name", pattern),
    supabase.from("profiles").select("id").ilike("last_name", pattern),
    supabase.from("profile_private").select("user_id").ilike("email", pattern),
    supabase.from("profile_private").select("user_id").ilike("dni", pattern),
  ])

  const ids = new Set<string>()
  for (const row of byFirst.data ?? []) ids.add(row.id)
  for (const row of byLast.data ?? []) ids.add(row.id)
  for (const row of byEmail.data ?? []) ids.add(row.user_id)
  for (const row of byDni.data ?? []) ids.add(row.user_id)
  return ids
}

/**
 * Member directory for one organization, joining `profiles` and (admin-only)
 * `profile_private`. RLS already scopes both to what the caller may see — the
 * `organization_id` filter below is what prevents cross-org leakage (D25).
 */
export async function listMembers(params: ListMembersParams): Promise<ListMembersResult> {
  const supabase = await createClient()
  const page = params.page && params.page > 0 ? params.page : 1
  const from = (page - 1) * MEMBERS_PAGE_SIZE
  const to = from + MEMBERS_PAGE_SIZE - 1

  const term = params.search?.trim()
  let matchingUserIds: string[] | null = null
  if (term) {
    const ids = await findMatchingUserIds(supabase, term)
    if (ids.size === 0) {
      return { items: [], total: 0, page, pageSize: MEMBERS_PAGE_SIZE }
    }
    matchingUserIds = Array.from(ids)
  }

  // Based on `profiles`, not `organization_memberships`, so the sort columns
  // are top-level: ordering a to-one embed (`{ referencedTable: "profiles" }`)
  // sorts rows *within* each embedded result, which is a no-op here and leaves
  // the page order unspecified — `range()` would then duplicate and skip
  // members across pages. `id` is the tiebreaker that makes paging stable.
  let query = supabase
    .from("profiles")
    .select(
      `id, first_name, last_name,
       profile_private(email, dni),
       organization_memberships!inner(id, role, status)`,
      { count: "exact" }
    )
    .eq("organization_memberships.organization_id", params.organizationId)
    .order("first_name", { ascending: true })
    .order("last_name", { ascending: true })
    .order("id", { ascending: true })

  if (params.role) {
    query = query.eq("organization_memberships.role", params.role)
  }
  if (params.status) {
    query = query.eq("organization_memberships.status", params.status)
  }
  if (matchingUserIds) {
    query = query.in("id", matchingUserIds)
  }

  const { data, error, count } = await query.range(from, to)

  if (error) {
    throw new AppError("INTERNAL", "No se pudo cargar la lista de miembros.")
  }

  // The org filter above reduces the embedded memberships to exactly one row.
  const items: MemberListItem[] = (data ?? []).flatMap((row) => {
    const membership = row.organization_memberships?.[0]
    if (!membership) {
      return []
    }

    return [
      {
        membershipId: membership.id,
        userId: row.id,
        fullName: `${row.first_name} ${row.last_name}`.trim(),
        role: membership.role,
        status: membership.status,
        email: row.profile_private?.email ?? null,
        dni: row.profile_private?.dni ?? null,
      },
    ]
  })

  return { items, total: count ?? 0, page, pageSize: MEMBERS_PAGE_SIZE }
}
