import { afterAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { cleanupFixtures, makeAssessmentFixture, makeCourseFixture } from "../helpers/course-fixtures"

/**
 * Phase 7 audit coverage sweep (D28): drives a real seeded happy path
 * (org bootstrap -> course publish -> enrollment -> attempt start/submit ->
 * grade) through the actual RPCs a member.role_changed and rejects a direct
 * INSERT and a cross-org `log_audit` call — the other half of D28's
 * "log_audit is the only write path" contract.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const orgIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
  if (orgIds.length > 0) {
    await supabaseAdmin.from("organizations").delete().in("id", orgIds)
  }
})

describe("seeded happy path produces the expected audit trail", () => {
  it("bootstrap -> publish -> enroll -> attempt -> grade, each with the right org/actor", async () => {
    const platformAdmin = await member("cov-platform-admin", ORG_A, "STUDENT")
    await supabaseAdmin.from("platform_admins").insert({ user_id: platformAdmin.id })

    const { data: bootstrap, error: bootstrapError } = await platformAdmin.client.rpc("create_organization", {
      p_name: "Auditoría Coverage Org",
      p_slug: `audit-coverage-${Date.now()}`,
    })
    expect(bootstrapError).toBeNull()
    const orgId = bootstrap?.[0]?.organization_id
    if (!orgId) throw new Error("organization not created")
    orgIds.push(orgId)

    const admin = await member("cov-admin", orgId, "ADMIN")
    const professor = await member("cov-professor", orgId, "PROFESSOR")
    const student = await member("cov-student", orgId, "STUDENT")

    const course = await makeCourseFixture({
      organizationId: orgId,
      title: "Curso cobertura de auditoría",
      status: "DRAFT",
      accessType: "FREE",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    await supabaseAdmin.from("course_professors").insert({ course_id: course.courseId, user_id: professor.id })

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: orgId,
      title: "Evaluación cobertura",
      kind: "QUIZ",
      multipleChoice: 1,
      openEnded: 1,
    })
    bankIds.push(fixture.bankId)

    const { error: publishError } = await admin.client.rpc("publish_course", { p_course: course.courseId })
    expect(publishError).toBeNull()

    const { data: enrollmentId, error: enrollError } = await student.client.rpc("self_enroll_free_course", {
      p_course: course.courseId,
    })
    expect(enrollError).toBeNull()
    if (!enrollmentId) throw new Error("enrollment not created")

    const { data: attemptId, error: startError } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(startError).toBeNull()
    if (!attemptId) throw new Error("attempt not started")

    const { error: submitError } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId,
      p_session: randomUUID(),
      p_answers: [],
    })
    expect(submitError).toBeNull()

    const { data: openQuestion } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id")
      .eq("attempt_id", attemptId)
      .eq("type", "OPEN_ENDED")
      .single()
    if (!openQuestion) throw new Error("open question not found")

    const { error: gradeError } = await professor.client.rpc("grade_open_answer", {
      p_attempt: attemptId,
      p_attempt_question: openQuestion.id,
      p_points: 1,
      p_feedback: "Bien",
    })
    expect(gradeError).toBeNull()

    const { data: rows, error: readError } = await supabaseAdmin
      .from("audit_logs")
      .select("action, organization_id, actor_user_id")
      .eq("organization_id", orgId)
    expect(readError).toBeNull()

    const byAction = new Map((rows ?? []).map((row) => [row.action, row]))
    expect(byAction.get("organization.created")).toMatchObject({
      organization_id: orgId,
      actor_user_id: platformAdmin.id,
    })
    expect(byAction.get("course.published")).toMatchObject({ organization_id: orgId, actor_user_id: admin.id })
    expect(byAction.get("assessment.started")).toMatchObject({ organization_id: orgId, actor_user_id: student.id })
    expect(byAction.get("assessment.submitted")).toMatchObject({ organization_id: orgId, actor_user_id: student.id })
    expect(byAction.get("assessment.graded")).toMatchObject({ organization_id: orgId, actor_user_id: professor.id })

    for (const row of rows ?? []) {
      expect(row.organization_id).toBe(orgId)
    }
  })
})

describe("audit_logs stays write-only through log_audit (D28)", () => {
  it("rejects a direct INSERT by an authenticated org admin", async () => {
    const admin = await member("cov-direct-insert-admin", ORG_A, "ADMIN")

    const { error } = await admin.client
      .from("audit_logs")
      .insert({ organization_id: ORG_A, action: "forged.event", entity_type: "course" })

    expect(error).not.toBeNull()
  })

  it("rejects `log_audit` for an org the caller is not a member of", async () => {
    const adminA = await member("cov-cross-org-admin", ORG_A, "ADMIN")

    const { error } = await adminA.client.rpc("log_audit", {
      p_org: ORG_B,
      p_action: "forged.cross_org",
      p_entity_type: "course",
    })

    expect(error?.code).toBe("42501")
  })
})
