import { afterAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const cleanupGroupIds: string[] = []

afterAll(async () => {
  await Promise.all(cleanup.map((id) => deleteUser(id)))
  if (cleanupGroupIds.length > 0) {
    await supabaseAdmin.from("groups").delete().in("id", cleanupGroupIds)
  }
})

const member = createMemberFactory(cleanup)

async function createGroup(org: string, name: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("groups")
    .insert({ organization_id: org, name })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("failed to create group")
  cleanupGroupIds.push(data.id)
  return data.id
}

describe("add_group_members / remove_group_member (D24)", () => {
  it("adds an ACTIVE STUDENT of the same org, is idempotent, and removal works", async () => {
    const adminA = await member("grp-admin-a", ORG_A, "ADMIN")
    const studentA = await member("grp-student-a", ORG_A, "STUDENT")
    const groupId = await createGroup(ORG_A, "Grupo A")

    const first = await adminA.client.rpc("add_group_members", { p_group: groupId, p_user_ids: [studentA.id] })
    expect(first.error).toBeNull()
    expect(first.data).toBe(1)

    // Re-adding the same member is idempotent: no error, 0 rows inserted.
    const second = await adminA.client.rpc("add_group_members", { p_group: groupId, p_user_ids: [studentA.id] })
    expect(second.error).toBeNull()
    expect(second.data).toBe(0)

    const { error: removeError } = await adminA.client.rpc("remove_group_member", {
      p_group: groupId,
      p_user: studentA.id,
    })
    expect(removeError).toBeNull()

    const { data: remaining } = await supabaseAdmin.from("group_members").select("user_id").eq("group_id", groupId)
    expect(remaining).toHaveLength(0)
  })

  it("rejects adding a cross-org student — assert_active_member_of_org raises a bare P0001", async () => {
    const adminA = await member("grp-admin-a-cross", ORG_A, "ADMIN")
    const studentB = await member("grp-student-b-cross", ORG_B, "STUDENT")
    const groupId = await createGroup(ORG_A, "Grupo Cross Org")

    const { error } = await adminA.client.rpc("add_group_members", { p_group: groupId, p_user_ids: [studentB.id] })
    expect(error?.code).toBe("P0001")

    const { data: members } = await supabaseAdmin.from("group_members").select("user_id").eq("group_id", groupId)
    expect(members).toHaveLength(0)
  })

  it("rejects adding a non-STUDENT member (e.g. PROFESSOR) via the same trigger", async () => {
    const adminA = await member("grp-admin-a-prof", ORG_A, "ADMIN")
    const professorA = await member("grp-professor-a", ORG_A, "PROFESSOR")
    const groupId = await createGroup(ORG_A, "Grupo Profesor")

    const { error } = await adminA.client.rpc("add_group_members", {
      p_group: groupId,
      p_user_ids: [professorA.id],
    })
    expect(error?.code).toBe("P0001")
  })

  it("org A admin cannot manage groups in org B (42501)", async () => {
    const adminA = await member("grp-admin-a-forbidden", ORG_A, "ADMIN")
    const studentB = await member("grp-student-b-forbidden", ORG_B, "STUDENT")
    const groupB = await createGroup(ORG_B, "Grupo B")

    const { error } = await adminA.client.rpc("add_group_members", {
      p_group: groupB,
      p_user_ids: [studentB.id],
    })
    expect(error?.code).toBe("42501")
  })
})
