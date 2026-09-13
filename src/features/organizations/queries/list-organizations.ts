import { createClient } from "@/lib/supabase/server"
import { likePattern } from "@/lib/db/like-pattern"
import type { OrganizationListItem } from "../types"

const PAGE_SIZE = 25

interface ListOrganizationsParams {
  page: number
  q?: string
}

interface ListOrganizationsResult {
  items: OrganizationListItem[]
  total: number
}

/** Platform-only read (RLS `organizations_select` allows `is_platform_admin()`). */
export async function listOrganizations({
  page,
  q,
}: ListOrganizationsParams): Promise<ListOrganizationsResult> {
  const supabase = await createClient()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from("organizations")
    .select("id, name, slug, status, organization_memberships(count)", { count: "exact" })
    // Names are not unique (only `slug` is), so `id` keeps paging stable.
    .order("name", { ascending: true })
    .order("id", { ascending: true })
    .range(from, to)

  if (q) {
    query = query.ilike("name", likePattern(q))
  }

  const { data, error, count } = await query

  if (error) {
    return { items: [], total: 0 }
  }

  return {
    items: (data ?? []).map((org) => ({
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: org.status,
      memberCount: org.organization_memberships?.[0]?.count ?? 0,
    })),
    total: count ?? 0,
  }
}

export { PAGE_SIZE as ORGANIZATIONS_PAGE_SIZE }
