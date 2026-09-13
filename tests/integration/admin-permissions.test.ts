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

async function membershipId(userId: string, org: string): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("organization_memberships")
    .select("id")
    .eq("organization_id", org)
    .eq("user_id", userId)
    .single()
  if (error || !data) throw error ?? new Error("membership not found")
  return data.id
}

describe("member directory: cross-org isolation (D25)", () => {
  it("org A admin cannot list org B members", async () => {
    const adminA = await member("admperm-admin-a", ORG_A, "ADMIN")
    await member("admperm-target-b", ORG_B, "STUDENT")

    const { data, error } = await adminA.client
      .from("organization_memberships")
      .select("id, profiles!organization_memberships_user_id_fkey(first_name)")
      .eq("organization_id", ORG_B)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

describe("registration links: cross-org isolation (D25)", () => {
  it("org A admin cannot create a link in org B", async () => {
    const adminA = await member("admperm-link-admin-a", ORG_A, "ADMIN")

    const { error } = await adminA.client.rpc("create_registration_link", {
      p_org: ORG_B,
      p_label: "Cross-org attempt",
      p_role: "STUDENT",
    })

    expect(error?.code).toBe("42501")
    expect(error?.message).toContain("Only an organization admin can create registration links")
  })
})

describe("member mutations: cross-org isolation (D25)", () => {
  it("org A admin cannot change status on an org B membership", async () => {
    const adminA = await member("admperm-status-admin-a", ORG_A, "ADMIN")
    const targetB = await member("admperm-status-target-b", ORG_B, "STUDENT")
    const targetMembershipId = await membershipId(targetB.id, ORG_B)

    const { error } = await adminA.client.rpc("set_membership_status", {
      p_membership: targetMembershipId,
      p_status: "INACTIVE",
    })

    expect(error?.code).toBe("42501")

    const { data: unchanged } = await supabaseAdmin
      .from("organization_memberships")
      .select("status")
      .eq("id", targetMembershipId)
      .single()
    expect(unchanged?.status).toBe("ACTIVE")
  })
})

describe("admin-only reads are denied to professors and students", () => {
  it("a professor cannot read a peer's profile_private (D27)", async () => {
    const professorA = await member("admperm-professor-a", ORG_A, "PROFESSOR")
    const peerA = await member("admperm-peer-a", ORG_A, "STUDENT")

    const { data, error } = await professorA.client
      .from("profile_private")
      .select("user_id, email, dni")
      .eq("user_id", peerA.id)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it("a student cannot read registration link tokens of their own org (D27/D37)", async () => {
    const studentA = await member("admperm-student-a", ORG_A, "STUDENT")

    const { data, error } = await studentA.client
      .from("organization_registration_links")
      .select("id, token")
      .eq("organization_id", ORG_A)

    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })

  it("a professor cannot call set_membership_role or set_membership_status", async () => {
    const professorA = await member("admperm-professor-rpc-a", ORG_A, "PROFESSOR")
    const targetA = await member("admperm-professor-target-a", ORG_A, "STUDENT")
    const targetMembershipId = await membershipId(targetA.id, ORG_A)

    const roleResult = await professorA.client.rpc("set_membership_role", {
      p_membership: targetMembershipId,
      p_role: "ADMIN",
    })
    expect(roleResult.error?.code).toBe("42501")

    const statusResult = await professorA.client.rpc("set_membership_status", {
      p_membership: targetMembershipId,
      p_status: "INACTIVE",
    })
    expect(statusResult.error?.code).toBe("42501")
  })
})

describe("membership guardrails stay in force from the admin UI's call sites", () => {
  it("cannot demote the caller's own role", async () => {
    const adminA = await member("admperm-self-admin", ORG_A, "ADMIN")
    const ownMembershipId = await membershipId(adminA.id, ORG_A)

    const { error } = await adminA.client.rpc("set_membership_role", {
      p_membership: ownMembershipId,
      p_role: "STUDENT",
    })

    expect(error?.code).toBe("22023")
  })

  it("cannot deactivate the sole ACTIVE admin of an org", async () => {
    const { data: org, error: orgError } = await supabaseAdmin
      .from("organizations")
      .insert({ name: "Scratch Org Admin Perms", slug: `scratch-admin-perms-${Date.now()}`, status: "ACTIVE" })
      .select("id")
      .single()
    if (orgError || !org) throw orgError ?? new Error("failed to create scratch org")

    try {
      const soleAdmin = await member("admperm-sole-admin", org.id, "ADMIN")
      const soleMembershipId = await membershipId(soleAdmin.id, org.id)
      const platformAdmin = await member("admperm-platform-admin", ORG_A, "STUDENT")
      await supabaseAdmin.from("platform_admins").insert({ user_id: platformAdmin.id })

      const { error } = await platformAdmin.client.rpc("set_membership_status", {
        p_membership: soleMembershipId,
        p_status: "INACTIVE",
      })

      expect(error?.code).toBe("22023")
      expect(error?.message).toContain("Organization must keep at least one ACTIVE admin")
    } finally {
      await supabaseAdmin.from("organizations").delete().eq("id", org.id)
    }
  })
})
