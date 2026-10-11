import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { buildSecurityFixture, type SecurityFixture } from "./fixture"
import { anonClient, deleteUser, makeUser } from "../helpers/make-user"
import { enrollStudent, makeAssessmentFixture, makeCourseFixture } from "../helpers/course-fixtures"
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
const extraCourseIds: string[] = []

beforeAll(async () => {
  fx = await buildSecurityFixture()
}, 60000)

afterAll(async () => {
  await fx.cleanup()
  if (extraBankIds.length > 0) await supabaseAdmin.from("question_banks").delete().in("id", extraBankIds)
  if (extraCourseIds.length > 0) await supabaseAdmin.from("courses").delete().in("id", extraCourseIds)
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
      offeringId: fx.courseA.offeringId,
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

describe("grade_attempt_batch: only the grading professor of the edition (or org admin) may save", () => {
  const batchArgs = (attempt: string, attemptQuestionId: string) => ({
    p_attempt: attempt,
    p_grades: [{ attempt_question_id: attemptQuestionId, points: 1, feedback: "intento" }],
    p_feedback: "intento",
  })

  it("denies the student who owns the attempt", async () => {
    const { error } = await fx.users.studentA.client.rpc("grade_attempt_batch", {
      ...batchArgs(fx.attemptA, fx.attemptQuestionOpenA),
    })
    expect(error?.code).toBe("42501")
  })

  it("denies a professor of the same org who is not assigned to the edition", async () => {
    const outsider = await makeUser("sec-batch-outsider", { organizationId: fx.orgA, role: "PROFESSOR" })
    extraUserIds.push(outsider.id)

    const { error } = await outsider.client.rpc("grade_attempt_batch", {
      ...batchArgs(fx.attemptA, fx.attemptQuestionOpenA),
    })
    expect(error?.code).toBe("42501")
  })

  it("denies a professor of another org", async () => {
    const { error } = await fx.users.profB.client.rpc("grade_attempt_batch", {
      ...batchArgs(fx.attemptA, fx.attemptQuestionOpenA),
    })
    expect(error?.code).toBe("42501")
  })

  it("denies another org's admin", async () => {
    const { error } = await fx.users.adminB.client.rpc("grade_attempt_batch", {
      ...batchArgs(fx.attemptA, fx.attemptQuestionOpenA),
    })
    expect(error?.code).toBe("42501")
  })

  it("denies an anonymous caller", async () => {
    const { error } = await anonClient().rpc("grade_attempt_batch", {
      ...batchArgs(fx.attemptA, fx.attemptQuestionOpenA),
    })
    expect(error).not.toBeNull()
  })

  it("the assigned professor is allowed past the authorisation gate (control)", async () => {
    // Denial above must come from the gate, not a broken signature: the same call
    // with the assigned professor reaches validation and is refused only for the
    // empty feedback, which proves the authorised path was taken.
    const { error } = await fx.users.profA.client.rpc("grade_attempt_batch", {
      p_attempt: fx.attemptA,
      p_grades: [{ attempt_question_id: fx.attemptQuestionOpenA, points: 1, feedback: null }],
      p_feedback: "   ",
    })
    expect(error?.message).toContain("INVALID_ANSWER")
  })
})

describe("recompute_attempt_score: internal helper, never executable by authenticated or anon", () => {
  it("authenticated has no EXECUTE on recompute_attempt_score", () => {
    expect(psqlBool("select has_function_privilege('authenticated','recompute_attempt_score(uuid)','execute');")).toBe(
      false
    )
  })

  it("anon has no EXECUTE on recompute_attempt_score", () => {
    expect(psqlBool("select has_function_privilege('anon','recompute_attempt_score(uuid)','execute');")).toBe(false)
  })

  it("an authenticated student cannot call it directly", async () => {
    const { error } = await fx.users.studentA.client.rpc("recompute_attempt_score", { p_attempt: fx.attemptA })
    expect(error).not.toBeNull()
  })
})

describe("staff transcript RPCs: edition-scoped, org-scoped, anon denied", () => {
  let otherEnrollmentA: string

  beforeAll(async () => {
    // A second edition of org A's course in which the same student (studentA) is
    // enrolled, but profA is NOT assigned to it.
    const course = await makeCourseFixture({
      organizationId: fx.orgA,
      title: "Sec Curso otra edición",
      modules: [{ title: "Módulo otro", requiredBlocks: 1 }],
    })
    extraCourseIds.push(course.courseId)
    otherEnrollmentA = await enrollStudent(course, fx.orgA, fx.users.studentA.id)
  })

  it("the assigned professor sees the enrollment of the edition they teach", async () => {
    const { data, error } = await fx.users.profA.client.rpc("staff_student_enrollments", {
      p_user: fx.users.studentA.id,
    })
    expect(error).toBeNull()
    expect(data!.map((r) => r.enrollment_id)).toContain(fx.enrollmentA)
  })

  it("a professor never sees a non-assigned edition of the same student", async () => {
    const { data, error } = await fx.users.profA.client.rpc("staff_student_enrollments", {
      p_user: fx.users.studentA.id,
    })
    expect(error).toBeNull()
    expect(data!.map((r) => r.enrollment_id)).not.toContain(otherEnrollmentA)

    const direct = await fx.users.profA.client.rpc("staff_enrollment_activity", { p_enrollment: otherEnrollmentA })
    expect(direct.error?.code).toBe("42501")
    const assessments = await fx.users.profA.client.rpc("staff_enrollment_assessments", {
      p_enrollment: otherEnrollmentA,
    })
    expect(assessments.error?.code).toBe("42501")
    const pending = await fx.users.profA.client.rpc("staff_enrollment_pending", { p_enrollment: otherEnrollmentA })
    expect(pending.error?.code).toBe("42501")
  })

  it("a same-org professor not assigned to any edition sees nothing for the student", async () => {
    const outsider = await makeUser("sec-transcript-outsider", { organizationId: fx.orgA, role: "PROFESSOR" })
    extraUserIds.push(outsider.id)

    const { data, error } = await outsider.client.rpc("staff_student_enrollments", {
      p_user: fx.users.studentA.id,
    })
    expect(error).toBeNull()
    expect(data).toEqual([])

    const direct = await outsider.client.rpc("staff_enrollment_assessments", { p_enrollment: fx.enrollmentA })
    expect(direct.error?.code).toBe("42501")
  })

  it("another org's admin gets empty enrollments and is refused the detail RPCs", async () => {
    const { data, error } = await fx.users.adminB.client.rpc("staff_student_enrollments", {
      p_user: fx.users.studentA.id,
    })
    expect(error).toBeNull()
    expect(data).toEqual([])

    const detailRpcs = ["staff_enrollment_assessments", "staff_enrollment_activity", "staff_enrollment_pending"] as const
    for (const fn of detailRpcs) {
      const { error: detailError } = await fx.users.adminB.client.rpc(fn, { p_enrollment: fx.enrollmentA })
      expect(detailError?.code, fn).toBe("42501")
    }
  })

  it("the org A admin sees the enrollment and the detail RPCs (control)", async () => {
    const { data, error } = await fx.users.adminA.client.rpc("staff_student_enrollments", {
      p_user: fx.users.studentA.id,
    })
    expect(error).toBeNull()
    expect(data!.map((r) => r.enrollment_id)).toEqual(expect.arrayContaining([fx.enrollmentA, otherEnrollmentA]))
  })

  it("the enrolled student (owner) is denied every staff transcript RPC (D24/F7)", async () => {
    // Staff RPCs expose staff-only data; the owner must use the my_* RPCs.
    const owner = fx.users.studentA.client
    const { data, error } = await owner.rpc("staff_student_enrollments", { p_user: fx.users.studentA.id })
    expect(error).toBeNull()
    expect(data).toEqual([])

    const detailRpcs = ["staff_enrollment_assessments", "staff_enrollment_activity", "staff_enrollment_pending"] as const
    for (const fn of detailRpcs) {
      const { error: detailError } = await owner.rpc(fn, { p_enrollment: fx.enrollmentA })
      expect(detailError?.code, fn).toBe("42501")
    }
  })

  it("can_staff_view_enrollment is internal (no EXECUTE for authenticated or anon)", () => {
    for (const role of ["authenticated", "anon"]) {
      expect(
        psqlBool(`select has_function_privilege('${role}','can_staff_view_enrollment(uuid)','execute');`),
        role
      ).toBe(false)
    }
  })

  it("a peer student cannot read another student's transcript", async () => {
    const { error } = await fx.users.studentB.client.rpc("staff_enrollment_activity", { p_enrollment: fx.enrollmentA })
    expect(error?.code).toBe("42501")
  })

  it("anon is denied every staff transcript RPC", async () => {
    const anon = anonClient()
    const calls = [
      anon.rpc("staff_student_enrollments", { p_user: fx.users.studentA.id }),
      anon.rpc("staff_enrollment_assessments", { p_enrollment: fx.enrollmentA }),
      anon.rpc("staff_enrollment_activity", { p_enrollment: fx.enrollmentA }),
      anon.rpc("staff_enrollment_pending", { p_enrollment: fx.enrollmentA }),
    ]
    for (const r of await Promise.all(calls)) {
      expect(r.error).not.toBeNull()
    }
  })
})
