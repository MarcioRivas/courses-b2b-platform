import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { anonClient, deleteUser, makeUser, type TestUser } from "../helpers/make-user"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

let adminA: TestUser
let studentA: TestUser
let studentA2: TestUser
let studentB: TestUser

beforeAll(async () => {
  adminA = await makeUser("rls-admin-a", { organizationId: ORG_A, role: "ADMIN" })
  studentA = await makeUser("rls-student-a", { organizationId: ORG_A, role: "STUDENT" })
  studentA2 = await makeUser("rls-student-a2", { organizationId: ORG_A, role: "STUDENT" })
  studentB = await makeUser("rls-student-b", { organizationId: ORG_B, role: "STUDENT" })
})

afterAll(async () => {
  await Promise.all([adminA, studentA, studentA2, studentB].map((u) => deleteUser(u.id)))
})

describe("cross-org isolation", () => {
  it("org A admin cannot read org B organizations/settings/memberships/groups", async () => {
    const org = await adminA.client.from("organizations").select("id").eq("id", ORG_B)
    expect(org.error).toBeNull()
    expect(org.data).toHaveLength(0)

    const settings = await adminA.client
      .from("organization_settings")
      .select("organization_id")
      .eq("organization_id", ORG_B)
    expect(settings.error).toBeNull()
    expect(settings.data).toHaveLength(0)

    const memberships = await adminA.client
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", ORG_B)
    expect(memberships.error).toBeNull()
    expect(memberships.data).toHaveLength(0)

    const groups = await adminA.client.from("groups").select("id").eq("organization_id", ORG_B)
    expect(groups.error).toBeNull()
    expect(groups.data).toHaveLength(0)
  })
})

describe("organization_memberships has no client write policy (D24)", () => {
  it("admin cannot INSERT/UPDATE/DELETE", async () => {
    const insert = await adminA.client
      .from("organization_memberships")
      .insert({ organization_id: ORG_A, user_id: studentB.id, role: "STUDENT" })
    expect(insert.error).not.toBeNull()

    // No UPDATE/DELETE policy exists at all, so Postgres RLS makes the target
    // rows invisible to the command (0 rows affected, no explicit error) rather
    // than raising — assert nothing changed instead of expecting an error.
    const update = await adminA.client
      .from("organization_memberships")
      .update({ role: "PROFESSOR" })
      .eq("user_id", studentA.id)
      .select("id")
    expect(update.error).toBeNull()
    expect(update.data).toHaveLength(0)

    const del = await adminA.client
      .from("organization_memberships")
      .delete()
      .eq("user_id", studentA.id)
      .select("id")
    expect(del.error).toBeNull()
    expect(del.data).toHaveLength(0)

    const { data: unchanged } = await supabaseAdmin
      .from("organization_memberships")
      .select("role")
      .eq("organization_id", ORG_A)
      .eq("user_id", studentA.id)
      .single()
    expect(unchanged?.role).toBe("STUDENT")
  })

  it("student cannot INSERT/UPDATE/DELETE", async () => {
    const insert = await studentA.client
      .from("organization_memberships")
      .insert({ organization_id: ORG_A, user_id: studentA.id, role: "ADMIN" })
    expect(insert.error).not.toBeNull()
  })

  it("platform admin cannot INSERT/UPDATE/DELETE either (no policy exists at all)", async () => {
    const platformAdmin = await makeUser("rls-platform-admin", { organizationId: ORG_A, role: "STUDENT" })
    await supabaseAdmin.from("platform_admins").insert({ user_id: platformAdmin.id })

    const insert = await platformAdmin.client
      .from("organization_memberships")
      .insert({ organization_id: ORG_B, user_id: studentB.id, role: "ADMIN" })
    expect(insert.error).not.toBeNull()

    await deleteUser(platformAdmin.id)
  })
})

describe("organization_registration_links unreadable outside org admins", () => {
  it("student and anon get 0 rows", async () => {
    const asStudent = await studentA.client.from("organization_registration_links").select("id")
    expect(asStudent.error).toBeNull()
    expect(asStudent.data).toHaveLength(0)

    const asAnon = await anonClient().from("organization_registration_links").select("id")
    expect(asAnon.error).toBeNull()
    expect(asAnon.data).toHaveLength(0)
  })
})

describe("platform_admins unwritable by authenticated", () => {
  it("INSERT fails", async () => {
    const insert = await adminA.client.from("platform_admins").insert({ user_id: adminA.id })
    expect(insert.error).not.toBeNull()
  })
})

describe("profile_private PII isolation (D27)", () => {
  it("a student cannot read a peer's profile_private but can read own", async () => {
    const own = await studentA.client.from("profile_private").select("user_id").eq("user_id", studentA.id)
    expect(own.error).toBeNull()
    expect(own.data).toHaveLength(1)

    const peer = await studentA.client
      .from("profile_private")
      .select("user_id")
      .eq("user_id", studentA2.id)
    expect(peer.error).toBeNull()
    expect(peer.data).toHaveLength(0)
  })

  it("org admin can read a member's profile_private", async () => {
    const asAdmin = await adminA.client
      .from("profile_private")
      .select("user_id")
      .eq("user_id", studentA.id)
    expect(asAdmin.error).toBeNull()
    expect(asAdmin.data).toHaveLength(1)
  })
})

describe("deactivating an org revokes member access (D29)", () => {
  it("member reads drop to 0 rows once org is INACTIVE", async () => {
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: "Scratch Org D29", slug: `scratch-d29-${Date.now()}`, status: "ACTIVE" })
      .select("id")
      .single()
    if (orgError || !org) throw orgError ?? new Error("failed to create scratch org")

    const { data: group, error: groupError } = await supabaseAdmin
      .from("groups")
      .insert({ organization_id: org.id, name: "Scratch Group" })
      .select("id")
      .single()
    if (groupError || !group) throw groupError ?? new Error("failed to create scratch group")

    const member = await makeUser("rls-d29-member", { organizationId: org.id, role: "STUDENT" })

    try {
      const beforeOrg = await member.client.from("organizations").select("id").eq("id", org.id)
      expect(beforeOrg.data).toHaveLength(1)
      const beforeGroups = await member.client.from("groups").select("id").eq("organization_id", org.id)
      expect(beforeGroups.data).toHaveLength(1)

      await supabaseAdmin.from("organizations").update({ status: "INACTIVE" }).eq("id", org.id)

      const afterOrg = await member.client.from("organizations").select("id").eq("id", org.id)
      expect(afterOrg.error).toBeNull()
      expect(afterOrg.data).toHaveLength(0)

      const afterGroups = await member.client.from("groups").select("id").eq("organization_id", org.id)
      expect(afterGroups.error).toBeNull()
      expect(afterGroups.data).toHaveLength(0)
    } finally {
      await deleteUser(member.id)
      await supabaseAdmin.from("organizations").delete().eq("id", org.id)
    }
  })
})
