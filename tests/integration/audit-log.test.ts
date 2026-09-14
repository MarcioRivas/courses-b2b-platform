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

describe("audit_logs write path (D28)", () => {
  it("direct INSERT into audit_logs by authenticated fails", async () => {
    const studentA = await member("audit-direct-insert", ORG_A, "STUDENT")
    const { error } = await studentA.client.from("audit_logs").insert({
      organization_id: ORG_A,
      actor_user_id: studentA.id,
      action: "fake.action",
      entity_type: "organization_membership",
    })
    expect(error?.code).toBe("42501")
    // Phase 7 (20260913160000_audit_indexes.sql) revokes the INSERT grant
    // outright (D28 belt-and-suspenders), so Postgres now denies at the
    // privilege check before RLS is even consulted — "permission denied",
    // not "row-level security policy".
    expect(error?.message).toContain("permission denied")
  })

  it("log_audit from a non-member of that org fails", async () => {
    const outsider = await member("audit-outsider", ORG_B, "STUDENT")
    const { error } = await outsider.client.rpc("log_audit", {
      p_org: ORG_A,
      p_action: "test.action",
      p_entity_type: "organization",
      p_entity_id: ORG_A,
    })
    expect(error?.code).toBe("42501")
    expect(error?.message).toContain("Caller is not a member")
  })

  it("rejects an empty action", async () => {
    const studentA = await member("audit-empty-action", ORG_A, "STUDENT")
    const { error } = await studentA.client.rpc("log_audit", {
      p_org: ORG_A,
      p_action: "",
      p_entity_type: "organization",
      p_entity_id: ORG_A,
    })
    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("must not be empty")
  })

  it("forces actor_user_id to the caller regardless of metadata spoofing attempts", async () => {
    const studentA = await member("audit-actor", ORG_A, "STUDENT")
    const decoy = await member("audit-decoy", ORG_A, "STUDENT")

    const { error } = await studentA.client.rpc("log_audit", {
      p_org: ORG_A,
      p_action: "test.actor_spoof",
      p_entity_type: "organization",
      p_entity_id: ORG_A,
      p_metadata: { actor_user_id: decoy.id, spoofed: true },
    })
    expect(error).toBeNull()

    const { data: row } = await supabaseAdmin
      .from("audit_logs")
      .select("actor_user_id")
      .eq("action", "test.actor_spoof")
      .eq("organization_id", ORG_A)
      .order("created_at", { ascending: false })
      .limit(1)
      .single()
    expect(row?.actor_user_id).toBe(studentA.id)
  })
})

describe("audit_logs SELECT policy", () => {
  it("student cannot SELECT audit_logs, admin can", async () => {
    const adminA = await member("audit-select-admin", ORG_A, "ADMIN")
    const studentA = await member("audit-select-student", ORG_A, "STUDENT")

    await adminA.client.rpc("log_audit", {
      p_org: ORG_A,
      p_action: "test.select_visibility",
      p_entity_type: "organization",
      p_entity_id: ORG_A,
    })

    const asStudent = await studentA.client
      .from("audit_logs")
      .select("id")
      .eq("action", "test.select_visibility")
    expect(asStudent.error).toBeNull()
    expect(asStudent.data).toHaveLength(0)

    const asAdmin = await adminA.client
      .from("audit_logs")
      .select("id")
      .eq("action", "test.select_visibility")
    expect(asAdmin.error).toBeNull()
    expect(asAdmin.data?.length).toBeGreaterThan(0)
  })
})
