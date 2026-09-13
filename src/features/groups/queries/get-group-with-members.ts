import { createClient } from "@/lib/supabase/server"
import type { GroupWithMembers } from "../types"

/** RLS-scoped read; explicit FK name since `group_members` has two FKs to `profiles`. */
export async function getGroupWithMembers(groupId: string): Promise<GroupWithMembers | null> {
  const supabase = await createClient()

  const { data: group, error } = await supabase
    .from("groups")
    .select("id, name, description, organization_id")
    .eq("id", groupId)
    .maybeSingle()

  if (error || !group) {
    return null
  }

  const { data: members } = await supabase
    .from("group_members")
    .select("id, user_id, profiles!group_members_user_id_fkey(first_name, last_name)")
    .eq("group_id", groupId)
    .order("added_at", { ascending: true })

  return {
    id: group.id,
    name: group.name,
    description: group.description,
    organizationId: group.organization_id,
    members: (members ?? []).map((member) => ({
      id: member.id,
      userId: member.user_id,
      firstName: member.profiles?.first_name ?? "",
      lastName: member.profiles?.last_name ?? "",
    })),
  }
}
