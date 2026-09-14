import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { buildSecurityFixture, type SecurityFixture } from "./fixture"
import { deleteUser, makeUser } from "../helpers/make-user"
import { makeAssessmentFixture } from "../helpers/course-fixtures"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { psqlBool } from "../helpers/sql"

/**
 * Special-case RPC permission checks from Phase 7 step 4 — the systematic
 * "every RPC × every role" sweep for the other ~55 `authenticated`-granted
 * functions lives in rls-matrix.test.ts (table-owning RPCs) and the existing
 * per-domain integration suites (registration-links, membership-rpcs,
 * offering-enrollment-sync, module-unlock, analytics-tenant-isolation,
 * authoring-rpcs*, start-attempt-rules, assessment-grading-and-unlock).
 * This file targets the specific adversarial scenarios the brief calls out
 * that aren't already asserted elsewhere.
 */

let fx: SecurityFixture
const extraBankIds: string[] = []
const extraUserIds: string[] = []

beforeAll(async () => {
  fx = await buildSecurityFixture()
}, 60000)

afterAll(async () => {
  await fx.cleanup()
  if (extraBankIds.length > 0) await supabaseAdmin.from("question_banks").delete().in("id", extraBankIds)
  for (const id of extraUserIds) await deleteUser(id)
})

describe("finalize_attempt / finalize_expired_attempts: owner-only, never authenticated (D25 regression guard)", () => {
  it("has_function_privilege('authenticated', ..., 'execute') is false for both", () => {
    expect(psqlBool("select has_function_privilege('authenticated','finalize_attempt(uuid,text)','execute');")).toBe(false)
    expect(psqlBool("select has_function_privilege('authenticated','finalize_expired_attempts()','execute');")).toBe(false)
  })
})

describe("log_audit_system: cron/postgres-only writer, never authenticated (D28)", () => {
  it("has_function_privilege('authenticated', ..., 'execute') is false", () => {
    expect(
      psqlBool("select has_function_privilege('authenticated','log_audit_system(uuid,text,text,uuid,jsonb)','execute');")
    ).toBe(false)
  })
})

describe("start_attempt outside the availability window", () => {
  it("rejects with ASSESSMENT_EXPIRED once available_until has passed", async () => {
    const expired = await makeAssessmentFixture({
      courseId: fx.courseA.courseId,
      organizationId: fx.orgA,
      title: "Evaluación expirada",
      kind: "QUIZ",
      multipleChoice: 1,
      availableFrom: new Date(Date.now() - 7_200_000).toISOString(),
      availableUntil: new Date(Date.now() - 3_600_000).toISOString(),
    })
    extraBankIds.push(expired.bankId)

    const { error } = await fx.users.studentA.client.rpc("start_attempt", {
      p_enrollment: fx.enrollmentA,
      p_assessment: expired.assessmentId,
    })
    expect(error?.message).toContain("ASSESSMENT_EXPIRED")
  })
})

describe("grade_open_answer by a professor of another course", () => {
  it("rejects profB grading an attempt-question that belongs to courseA", async () => {
    const { error } = await fx.users.profB.client.rpc("grade_open_answer", {
      p_attempt: fx.attemptA,
      p_attempt_question: fx.attemptQuestionOpenA,
      p_points: 1,
      p_feedback: "intento cruzado",
    })
    expect(error?.code).toBe("42501")
  })
})

describe("complete_registration with a revoked token", () => {
  it("rejects with the 'no longer active' guard", async () => {
    const token = `sec-revoked-${randomUUID()}`
    await supabaseAdmin.from("organization_registration_links").insert({
      organization_id: fx.orgA,
      token,
      default_role: "STUDENT",
      is_active: true,
      revoked_at: new Date().toISOString(),
    })

    const candidate = await makeUser("sec-revoked-candidate")
    extraUserIds.push(candidate.id)
    const { error } = await candidate.client.rpc("complete_registration", {
      p_token: token,
      p_first_name: "Revocado",
      p_last_name: "Candidato",
      p_phone: "099333444",
      p_dni: "33334444",
    })
    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("no longer active")

    await supabaseAdmin.from("organization_registration_links").delete().eq("token", token)
  })
})

describe("set_membership_role: last-admin and self-demotion guards", () => {
  it("refuses adminA demoting their own membership", async () => {
    const { data: own } = await supabaseAdmin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", fx.orgA)
      .eq("user_id", fx.users.adminA.id)
      .single()

    const { error } = await fx.users.adminA.client.rpc("set_membership_role", {
      p_membership: own!.id,
      p_role: "STUDENT",
    })
    expect(error?.code).toBe("22023")
  })

  it("refuses deactivating the sole ACTIVE admin of the org, even as a platform admin", async () => {
    const { data: own } = await supabaseAdmin
      .from("organization_memberships")
      .select("id")
      .eq("organization_id", fx.orgA)
      .eq("user_id", fx.users.adminA.id)
      .single()

    const { error } = await fx.users.superAdmin.client.rpc("set_membership_status", {
      p_membership: own!.id,
      p_status: "INACTIVE",
    })
    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("at least one ACTIVE admin")
  })
})

describe("create_registration_link: ADMIN role is platform-admin only (D23)", () => {
  it("refuses an org admin creating an ADMIN-role link in their own org", async () => {
    const { error } = await fx.users.adminA.client.rpc("create_registration_link", {
      p_org: fx.orgA,
      p_label: "Escalada",
      p_role: "ADMIN",
    })
    expect(error?.code).toBe("42501")
  })

  it("allows a platform admin to create an ADMIN-role link for any org", async () => {
    const { data, error } = await fx.users.superAdmin.client.rpc("create_registration_link", {
      p_org: fx.orgA,
      p_label: "Bootstrap admin",
      p_role: "ADMIN",
    })
    expect(error).toBeNull()
    const created = data?.[0]
    if (created) await supabaseAdmin.from("organization_registration_links").delete().eq("id", created.id)
  })
})

describe("analytics functions with a foreign entity id (D25)", () => {
  it("assessment_score_distribution refuses org A's admin on org B's assessment", async () => {
    const { error } = await fx.users.adminA.client.rpc("assessment_score_distribution", {
      p_assessment: fx.assessmentB.assessmentId,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("replace_question_options: cross-course rejection", () => {
  it("refuses profB replacing options on a question owned by courseA", async () => {
    const { error } = await fx.users.profB.client.rpc("replace_question_options", {
      p_question: fx.assessmentA.questions[0]!.questionId,
      p_options: [{ label: "Hackeada", position: 1, is_correct: true }],
    })
    expect(error?.code).toBe("42501")
  })

  it("allows profA (the assigned professor) to replace options on their own question", async () => {
    const { error } = await fx.users.profA.client.rpc("replace_question_options", {
      p_question: fx.assessmentA.questions[0]!.questionId,
      p_options: [
        { label: "A", position: 1, is_correct: true },
        { label: "B", position: 2, is_correct: false },
      ],
    })
    expect(error).toBeNull()
  })
})

describe("set_assessment_questions: cross-course rejection", () => {
  it("refuses profB setting the question list of assessmentA", async () => {
    const { error } = await fx.users.profB.client.rpc("set_assessment_questions", {
      p_assessment: fx.assessmentA.assessmentId,
      p_items: [{ question_id: fx.spareQuestionA, position: 1, points: 1 }],
    })
    expect(error?.code).toBe("42501")
  })
})

describe("attempt_result: owner-only read", () => {
  it("refuses a different student reading attemptA's result", async () => {
    const { error } = await fx.users.studentB.client.rpc("attempt_result", { p_attempt: fx.attemptA })
    expect(error?.code).toBe("42501")
  })

  it("allows the owning (graded) student to read their own result", async () => {
    const { data, error } = await fx.users.studentA.client.rpc("attempt_result", { p_attempt: fx.attemptA })
    expect(error).toBeNull()
    expect(data?.[0]?.attempt_id).toBe(fx.attemptA)
  })
})
