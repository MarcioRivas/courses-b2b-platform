import { createClient } from "@/lib/supabase/server"
import { likePattern } from "@/lib/db/like-pattern"
import type { GroupListItem } from "../types"

const PAGE_SIZE = 25

interface ListGroupsParams {
  organizationId: string
  page: number
  q?: string
}

interface ListGroupsResult {
  items: GroupListItem[]
  total: number
}

export async function listGroups({ organizationId, page, q }: ListGroupsParams): Promise<ListGroupsResult> {
  const supabase = await createClient()
  const from = (page - 1) * PAGE_SIZE
  const to = from + PAGE_SIZE - 1

  let query = supabase
    .from("groups")
    .select("id, name, description, group_members(count)", { count: "exact" })
    .eq("organization_id", organizationId)
    .order("name", { ascending: true })
    .range(from, to)

  if (q) {
    query = query.ilike("name", likePattern(q))
  }

  const { data, error, count } = await query

  if (error) {
    return { items: [], total: 0 }
  }

  return {
    items: (data ?? []).map((group) => ({
      id: group.id,
      name: group.name,
      description: group.description,
      memberCount: group.group_members?.[0]?.count ?? 0,
    })),
    total: count ?? 0,
  }
}

export { PAGE_SIZE as GROUPS_PAGE_SIZE }
