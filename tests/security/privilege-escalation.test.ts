import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { anonClient, deleteUser, makeUser } from "../helpers/make-user"
import { buildSecurityFixture, type SecurityFixture } from "./fixture"
import { supabaseAdmin } from "../helpers/supabase-admin"

/**
 * Phase 7 step 5. Each item is deliberately compact — the exhaustive,
 * table-driven proof is rls-matrix.test.ts; this file targets the specific
 * adversarial scenarios named in the brief that benefit from a direct,
 * narrative assertion (D24, C8, D27, D28, D29, trigger guards).
 */

let fx: SecurityFixture
const extraOrgIds: string[] = []
const extraUserIds: string[] = []

beforeAll(async () => {
  fx = await buildSecurityFixture()
}, 60000)

afterAll(async () => {
  await fx.cleanup()
  if (extraOrgIds.length > 0) await supabaseAdmin.from("organizations").delete().in("id", extraOrgIds)
  for (const id of extraUserIds) await deleteUser(id)
})

describe("D24: no authenticated role writes directly into the no-direct-write tables", () => {
  const payloads: Record<string, () => Record<string, unknown>> = {
    content_progress: () => ({ enrollment_id: fx.enrollmentA, content_block_id: fx.courseA.modules[0]!.blockIds[0]! }),
    assessment_attempts: () => ({
      assessment_id: fx.assessmentA.assessmentId,
      enrollment_id: fx.enrollmentA,
      user_id: fx.users.studentA.id,
      organization_id: fx.orgA,
      attempt_number: 99,
    }),
    assessment_attempt_questions: () => ({
      attempt_id: fx.attemptA,
      question_id: fx.spareQuestionA,
      position: 99,
      type: "MULTIPLE_CHOICE",
      prompt: "hack",
      points: 1,
    }),
    assessment_attempt_answer_keys: () => ({ attempt_id: fx.attemptA, attempt_question_id: fx.attemptQuestionMcA }),
    assessment_grades: () => ({ attempt_id: fx.attemptA, attempt_question_id: fx.attemptQuestionMcA, points_awarded: 999 }),
    assessment_feedback: () => ({ attempt_id: fx.attemptA, feedback: "hack" }),
    course_enrollments: () => ({
      organization_id: fx.orgA,
      course_id: fx.courseA.courseId,
      offering_id: fx.courseA.offeringId,
      user_id: fx.users.studentA.id,
      source: "GROUP_ASSIGNMENT",
    }),
    organization_memberships: () => ({ organization_id: fx.orgA, user_id: fx.users.studentA.id, role: "ADMIN" }),
    audit_logs: () => ({ organization_id: fx.orgA, actor_user_id: fx.users.studentA.id, action: "hack", entity_type: "organization" }),
    platform_admins: () => ({ user_id: fx.users.studentA.id }),
  }

  for (const [table, payload] of Object.entries(payloads)) {
    it(`studentA cannot INSERT into ${table}`, async () => {
      const { error } = await fx.users.studentA.client.from(table as "content_progress").insert(payload() as never)
      // A unique-constraint collision (e.g. re-inserting fx.enrollmentA's key)
      // would also throw but wouldn't prove RLS/grant denial (M2) — require
      // 42501. These tables have zero INSERT grant to `authenticated`, so the
      // ACL check fires before any constraint is even evaluated.
      expect(error?.code, `${table}: ${error?.message}`).toBe("42501")
    })
  }
})

describe("C8: assessment_attempt_answer_keys is never visible, even to staff", () => {
  it("adminA and profA both get a permission error (no grant, no policy at all)", async () => {
    const admin = await fx.users.adminA.client
      .from("assessment_attempt_answer_keys")
      .select("attempt_question_id")
      .eq("attempt_question_id", fx.attemptQuestionMcA)
    expect(admin.error?.code).toBe("42501")
    expect(admin.data).toBeNull()

    const prof = await fx.users.profA.client
      .from("assessment_attempt_answer_keys")
      .select("attempt_question_id")
      .eq("attempt_question_id", fx.attemptQuestionMcA)
    expect(prof.error?.code).toBe("42501")
    expect(prof.data).toBeNull()
  })
})

describe("students never read assessment_grades / assessment_feedback / assessment_attempts directly (RPC only)", () => {
  it("studentA's own rows are invisible via direct table SELECT", async () => {
    const grades = await fx.users.studentA.client.from("assessment_grades").select("id").eq("attempt_id", fx.attemptA)
    expect(grades.data).toHaveLength(0)

    const feedback = await fx.users.studentA.client.from("assessment_feedback").select("id").eq("attempt_id", fx.attemptA)
    expect(feedback.data).toHaveLength(0)

    const attempts = await fx.users.studentA.client.from("assessment_attempts").select("id").eq("id", fx.attemptA)
    expect(attempts.data).toHaveLength(0)
  })
})

describe("audit_logs: unforgeable, org-scoped writer (D28)", () => {
  it("direct INSERT is denied even with a plausible payload", async () => {
    const { error } = await fx.users.studentA.client
      .from("audit_logs")
      .insert({ organization_id: fx.orgA, actor_user_id: fx.users.studentA.id, action: "hack.direct", entity_type: "organization" })
    expect(error?.code).toBe("42501")
  })

  it("log_audit refuses to write for an org the caller does not belong to", async () => {
    const { error } = await fx.users.studentA.client.rpc("log_audit", {
      p_org: fx.orgB,
      p_action: "hack.cross_org",
      p_entity_type: "organization",
      p_entity_id: fx.orgB,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("organization_registration_links: token confidentiality (D23/D27)", () => {
  it("anon cannot read any row", async () => {
    const { data, error } = await anonClient().from("organization_registration_links").select("id, token").eq("organization_id", fx.orgA)
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it("a non-admin member (studentA) cannot read tokens of their own org", async () => {
    const { data, error } = await fx.users.studentA.client
      .from("organization_registration_links")
      .select("id, token")
      .eq("organization_id", fx.orgA)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

describe("profile_private: a peer (non-admin, same org) cannot read another member's PII (D27)", () => {
  it("profA cannot read studentA's email/phone/dni despite sharing an ACTIVE org", async () => {
    const { data, error } = await fx.users.profA.client
      .from("profile_private")
      .select("user_id, email, dni")
      .eq("user_id", fx.users.studentA.id)
    expect(error).toBeNull()
    expect(data).toHaveLength(0)
  })
})

describe("group_members / course_professors: trigger blocks foreign-org and wrong-role inserts", () => {
  it("admin cannot add a foreign-org (studentB) user to an org-A group", async () => {
    const { error } = await fx.users.adminA.client
      .from("group_members")
      .insert({ group_id: fx.spareGroupA, user_id: fx.users.studentB.id })
    expect(error).not.toBeNull()
    expect(error?.message).toContain("does not have an ACTIVE")
  })

  it("admin cannot assign a STUDENT as course_professor (wrong role)", async () => {
    const { error } = await fx.users.adminA.client
      .from("course_professors")
      .insert({ course_id: fx.spareCourseA, user_id: fx.users.studentA.id })
    expect(error).not.toBeNull()
    expect(error?.message).toContain("does not have an ACTIVE")
  })
})

describe("D29: INACTIVE membership / organization fail is_org_member instantly", () => {
  it("an INACTIVE membership loses org access", async () => {
    const outsider = await makeUser("priv-esc-inactive-member", { organizationId: fx.orgA, role: "STUDENT" })
    extraUserIds.push(outsider.id)
    await supabaseAdmin
      .from("organization_memberships")
      .update({ status: "INACTIVE" })
      .eq("organization_id", fx.orgA)
      .eq("user_id", outsider.id)

    const { data } = await outsider.client.rpc("is_org_member", { p_org: fx.orgA })
    expect(data).toBe(false)
  })

  it("an INACTIVE organization loses ALL members' access instantly", async () => {
    const { data: org, error } = await supabaseAdmin
      .from("organizations")
      .insert({ name: "Priv Esc Org", slug: `priv-esc-org-${Date.now()}`, status: "ACTIVE" })
      .select("id")
      .single()
    if (error || !org) throw error ?? new Error("org not created")
    extraOrgIds.push(org.id)

    const member = await makeUser("priv-esc-inactive-org", { organizationId: org.id, role: "ADMIN" })
    extraUserIds.push(member.id)

    const before = await member.client.rpc("is_org_member", { p_org: org.id })
    expect(before.data).toBe(true)

    await supabaseAdmin.from("organizations").update({ status: "INACTIVE" }).eq("id", org.id)

    const after = await member.client.rpc("is_org_member", { p_org: org.id })
    expect(after.data).toBe(false)
  })
})
