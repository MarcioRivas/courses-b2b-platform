import { afterAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
afterAll(async () => {
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

const member = createMemberFactory(cleanup)

async function membershipRow(userId: string, org: string): Promise<{ id: string; role: string; status: string }> {
  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("id, role, status")
    .eq("organization_id", org)
    .eq("user_id", userId)
    .single()
  if (error || !data) throw error ?? new Error("membership not found")
  return data
}

async function membershipIdFor(userId: string, org: string): Promise<string> {
  return (await membershipRow(userId, org)).id
}

describe("set_membership_role", () => {
  it("org A admin cannot change a role on an org B membership (D25)", async () => {
    const adminA = await member("mrpc-admin-a", ORG_A, "ADMIN")
    const targetB = await member("mrpc-target-b", ORG_B, "STUDENT")
    const membershipId = await membershipIdFor(targetB.id, ORG_B)

    const { error } = await adminA.client.rpc("set_membership_role", {
      p_membership: membershipId,
      p_role: "ADMIN",
    })
    expect(error?.code).toBe("42501")
    expect(error?.message).toContain("Only an organization admin")

    const { data: unchanged } = await supabaseAdmin
      .from("organization_memberships")
      .select("role")
      .eq("id", membershipId)
      .single()
    expect(unchanged?.role).toBe("STUDENT")
  })

  it("org B student cannot call set_membership_role on an org A membership — non-member NULL bypass (C1)", async () => {
    // Before C1's fix, `is_org_admin` returned NULL (not false) for a caller
    // with no membership row at all in the target org, and `if not (select
    // is_org_admin(...))` treats NULL as "don't raise" — silently letting any
    // authenticated stranger through the guard.
    const studentB = await member("mrpc-nonmember-b", ORG_B, "STUDENT")
    const targetA = await member("mrpc-target-a", ORG_A, "STUDENT")
    const membershipId = await membershipIdFor(targetA.id, ORG_A)

    const { error } = await studentB.client.rpc("set_membership_role", {
      p_membership: membershipId,
      p_role: "ADMIN",
    })
    expect(error?.code).toBe("42501")
    expect(error?.message).toContain("Only an organization admin")

    const { data: unchanged } = await supabaseAdmin
      .from("organization_memberships")
      .select("role")
      .eq("id", membershipId)
      .single()
    expect(unchanged?.role).toBe("STUDENT")
  })

  it("admin cannot change their own membership role", async () => {
    const adminA = await member("mrpc-self-admin", ORG_A, "ADMIN")
    const ownMembershipId = await membershipIdFor(adminA.id, ORG_A)

    const { error } = await adminA.client.rpc("set_membership_role", {
      p_membership: ownMembershipId,
      p_role: "STUDENT",
    })
    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("Cannot change your own membership role")
  })

  it("cannot demote the only ACTIVE admin of an org", async () => {
    // Uses a scratch org (not ORG_A) so the seeded admin@club-a.test membership,
    // shared with the concurrently-running E2E suite, is never touched.
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: "Scratch Org Sole Admin", slug: `scratch-sole-admin-${Date.now()}`, status: "ACTIVE" })
      .select("id")
      .single()
    if (orgError || !org) throw orgError ?? new Error("failed to create scratch org")

    try {
      const soleAdmin = await member("mrpc-sole-admin", org.id, "ADMIN")
      const soleMembershipId = await membershipIdFor(soleAdmin.id, org.id)
      // Platform admin (not a member of `org`) triggers the "remaining admins" guard
      // without also tripping the separate "own membership" guard.
      const platformAdmin = await member("mrpc-platform-admin", ORG_A, "STUDENT")
      await supabaseAdmin.from("platform_admins").insert({ user_id: platformAdmin.id })

      const { error } = await platformAdmin.client.rpc("set_membership_role", {
        p_membership: soleMembershipId,
        p_role: "STUDENT",
      })
      expect(error?.code).toBe("22023")
      expect(error?.message).toContain("Organization must keep at least one ACTIVE admin")
    } finally {
      await supabaseAdmin.from("organizations").delete().eq("id", org.id)
    }
  })

  it("a valid role change succeeds and is audited", async () => {
    const adminA = await member("mrpc-valid-admin", ORG_A, "ADMIN")
    const student = await member("mrpc-valid-student", ORG_A, "STUDENT")
    const membershipId = await membershipIdFor(student.id, ORG_A)

    const { error } = await adminA.client.rpc("set_membership_role", {
      p_membership: membershipId,
      p_role: "PROFESSOR",
    })
    expect(error).toBeNull()

    const { data: audited } = await adminA.client
      .from("audit_logs")
      .select("action, entity_id")
      .eq("entity_id", membershipId)
      .eq("action", "member.role_changed")
    expect(audited).toHaveLength(1)
  })
})

describe("set_membership_status", () => {
  it("org B student cannot call set_membership_status on an org A membership — non-member NULL bypass (C1)", async () => {
    const studentB = await member("mrpc-status-nonmember-b", ORG_B, "STUDENT")
    const targetA = await member("mrpc-status-target-a", ORG_A, "STUDENT")
    const membershipId = await membershipIdFor(targetA.id, ORG_A)

    const { error } = await studentB.client.rpc("set_membership_status", {
      p_membership: membershipId,
      p_status: "INACTIVE",
    })
    expect(error?.code).toBe("42501")
    expect(error?.message).toContain("Only an organization admin")

    const { data: unchanged } = await supabaseAdmin
      .from("organization_memberships")
      .select("status")
      .eq("id", membershipId)
      .single()
    expect(unchanged?.status).toBe("ACTIVE")
  })

  it("setting a member INACTIVE drops their reads to 0 rows", async () => {
    const adminA = await member("mrpc-status-admin", ORG_A, "ADMIN")
    const student = await member("mrpc-status-student", ORG_A, "STUDENT")
    const membershipId = await membershipIdFor(student.id, ORG_A)

    const before = await student.client.from("organizations").select("id").eq("id", ORG_A)
    expect(before.data).toHaveLength(1)

    const { error } = await adminA.client.rpc("set_membership_status", {
      p_membership: membershipId,
      p_status: "INACTIVE",
    })
    expect(error).toBeNull()

    const after = await student.client.from("organizations").select("id").eq("id", ORG_A)
    expect(after.data).toHaveLength(0)
  })
})
