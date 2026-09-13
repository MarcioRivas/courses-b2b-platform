import { afterAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanupUsers: string[] = []
const cleanupGroups: string[] = []

afterAll(async () => {
  await supabaseAdmin.from("groups").delete().in("id", cleanupGroups)
  await Promise.all(cleanupUsers.map((id) => deleteUser(id)))
})

const member = createMemberFactory(cleanupUsers)

async function groupIn(org: string, name: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("groups")
    .insert({ organization_id: org, name })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("failed to create group")
  cleanupGroups.push(data.id)
  return data.id
}

// `assert_active_member_of_org` (docs/authorization.md) requires the target
// user to hold an ACTIVE STUDENT membership in the group's organization.
// Passing RLS (is_org_admin) is not enough — the trigger is a second,
// independent guard against admins adding the wrong kind of row (W11).
describe("assert_active_member_of_org trigger on group_members", () => {
  it("org admin cannot add a non-member of the org to one of its groups", async () => {
    const adminA = await member("gmt-admin-a", ORG_A, "ADMIN")
    const outsiderB = await member("gmt-outsider-b", ORG_B, "STUDENT")
    const groupId = await groupIn(ORG_A, `Non-member test ${Date.now()}`)

    const { error } = await adminA.client
      .from("group_members")
      .insert({ group_id: groupId, user_id: outsiderB.id })

    expect(error).not.toBeNull()
    expect(error?.message).toContain("does not have an ACTIVE STUDENT membership")

    const { data: unchanged } = await supabaseAdmin
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", outsiderB.id)
    expect(unchanged).toHaveLength(0)
  })

  it("org admin cannot add a PROFESSOR (wrong role) to a group", async () => {
    const adminA = await member("gmt-admin-a2", ORG_A, "ADMIN")
    const professorA = await member("gmt-professor-a", ORG_A, "PROFESSOR")
    const groupId = await groupIn(ORG_A, `Wrong role test ${Date.now()}`)

    const { error } = await adminA.client
      .from("group_members")
      .insert({ group_id: groupId, user_id: professorA.id })

    expect(error).not.toBeNull()
    expect(error?.message).toContain("does not have an ACTIVE STUDENT membership")

    const { data: unchanged } = await supabaseAdmin
      .from("group_members")
      .select("id")
      .eq("group_id", groupId)
      .eq("user_id", professorA.id)
    expect(unchanged).toHaveLength(0)
  })

  it("org admin can add an ACTIVE STUDENT of the same org", async () => {
    const adminA = await member("gmt-admin-a3", ORG_A, "ADMIN")
    const studentA = await member("gmt-student-a", ORG_A, "STUDENT")
    const groupId = await groupIn(ORG_A, `Valid member test ${Date.now()}`)

    const { error } = await adminA.client
      .from("group_members")
      .insert({ group_id: groupId, user_id: studentA.id })

    expect(error).toBeNull()
  })
})
