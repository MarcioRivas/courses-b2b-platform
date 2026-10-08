import { afterAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { anonClient } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  cleanupFixtures,
} from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"

/**
 * The confidentiality contract (C8/D24/F7). Every test here asserts something
 * a student must NOT be able to reach: the answer key, another student's work,
 * or their own score before a professor has finished grading it.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })

})

async function scenario(title: string, spec: { multipleChoice?: number; openEnded?: number } = {}) {
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)

  const fixture = await makeAssessmentFixture({
    offeringId: course.offeringId,
    organizationId: ORG_A,
    title: `${title} — evaluación`,
    kind: "QUIZ",
    multipleChoice: spec.multipleChoice ?? 1,
    openEnded: spec.openEnded ?? 0,
  })
  bankIds.push(fixture.bankId)
  return { course, fixture }
}

async function start(student: TestUser, enrollmentId: string, assessmentId: string): Promise<string> {
  const { data, error } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: assessmentId,
  })
  if (error || !data) throw error ?? new Error("attempt not started")
  return data
}

describe("the answer key is unreachable (C8)", () => {
  it("denies a student, and denies anon", async () => {
    const student = await member("key-student", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso clave")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    await start(student, enrollmentId, fixture.assessmentId)

    const asStudent = await student.client.from("assessment_attempt_answer_keys").select("*")
    expect(asStudent.error).not.toBeNull()
    expect(asStudent.data ?? []).toHaveLength(0)

    const asAnon = await anonClient().from("assessment_attempt_answer_keys").select("*")
    expect(asAnon.error).not.toBeNull()
  })

  it("denies an org admin and a professor too — nobody reads it over the API", async () => {
    const admin = await member("key-admin", ORG_A, "ADMIN")
    const professor = await member("key-prof", ORG_A, "PROFESSOR")

    const adminRead = await admin.client.from("assessment_attempt_answer_keys").select("*")
    const profRead = await professor.client.from("assessment_attempt_answer_keys").select("*")
    expect(adminRead.error).not.toBeNull()
    expect(profRead.error).not.toBeNull()
  })

  it("never leaks is_correct into the student's question snapshot", async () => {
    const student = await member("key-snapshot", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso snapshot clave")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const attemptId = await start(student, enrollmentId, fixture.assessmentId)

    const { data } = await student.client
      .from("assessment_attempt_questions")
      .select("options")
      .eq("attempt_id", attemptId)

    for (const row of data ?? []) {
      const serialized = JSON.stringify(row.options)
      expect(serialized).not.toContain("is_correct")
      expect(serialized).not.toContain("correct")
    }
  })

  it("hides the question bank itself from students", async () => {
    const student = await member("key-bank", ORG_A, "STUDENT")
    const { fixture } = await scenario("Curso banco oculto")

    const banks = await student.client.from("question_banks").select("id")
    const questions = await student.client.from("questions").select("id")
    const options = await student.client.from("question_options").select("id, is_correct")

    expect(banks.data ?? []).toHaveLength(0)
    expect(questions.data ?? []).toHaveLength(0)
    expect(options.data ?? []).toHaveLength(0)
    expect(fixture.questions.length).toBeGreaterThan(0)
  })
})

describe("a submitted attempt is not a correctness oracle (F7)", () => {
  it("withholds scores and correctness until the attempt is GRADED", async () => {
    const student = await member("oracle-student", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso oráculo", { multipleChoice: 1, openEnded: 1 })
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const attemptId = await start(student, enrollmentId, fixture.assessmentId)
    const session = randomUUID()

    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })
    const { data: submitted } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId,
      p_session: session,
      p_answers: [],
    })

    // An OPEN_ENDED question means a human still has to grade it.
    expect(submitted![0]!.status).toBe("SUBMITTED")

    const { data: view } = await student.client.rpc("student_attempt_view", { p_attempt: attemptId })
    for (const row of view ?? []) {
      expect(row.points_awarded).toBeNull()
      expect(row.is_correct).toBeNull()
      expect(row.feedback).toBeNull()
    }

    const { data: listed } = await student.client.rpc("list_my_attempts", { p_enrollment: enrollmentId })
    const entry = (listed ?? []).find((r) => r.assessment_id === fixture.assessmentId)
    expect(entry!.score_percent).toBeNull()
    expect(entry!.score_label).toBeNull()
    expect(entry!.passed).toBeNull()

    // `attempt_result` is the per-attempt read the result page uses — same gate.
    const { data: result } = await student.client.rpc("attempt_result", { p_attempt: attemptId })
    expect(result![0]!.status).toBe("SUBMITTED")
    expect(result![0]!.score_percent).toBeNull()
    expect(result![0]!.score_label).toBeNull()
    expect(result![0]!.passed).toBeNull()
    expect(result![0]!.overall_feedback).toBeNull()
  })

  it("gives no direct SELECT on attempts, grades or feedback", async () => {
    const student = await member("oracle-direct", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso lectura directa")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const attemptId = await start(student, enrollmentId, fixture.assessmentId)

    const attempts = await student.client.from("assessment_attempts").select("id, score_percent")
    const grades = await student.client.from("assessment_grades").select("id")
    const feedback = await student.client.from("assessment_feedback").select("id")

    expect(attempts.data ?? []).toHaveLength(0)
    expect(grades.data ?? []).toHaveLength(0)
    expect(feedback.data ?? []).toHaveLength(0)
    expect(attemptId).toBeTruthy()
  })

  it("reveals the score once GRADED", async () => {
    const student = await member("oracle-graded", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso corregido", { multipleChoice: 2 })
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const attemptId = await start(student, enrollmentId, fixture.assessmentId)
    const session = randomUUID()

    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })
    const { data: submitted } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId,
      p_session: session,
      p_answers: [],
    })

    // MC-only: graded on the spot.
    expect(submitted![0]!.status).toBe("GRADED")

    const { data: view } = await student.client.rpc("student_attempt_view", { p_attempt: attemptId })
    expect(view!.every((row) => row.points_awarded !== null)).toBe(true)

    const { data: result } = await student.client.rpc("attempt_result", { p_attempt: attemptId })
    expect(result![0]!.status).toBe("GRADED")
    expect(result![0]!.score_percent).not.toBeNull()
  })
})

describe("attempt RPC ownership", () => {
  it("refuses every attempt RPC for a different student", async () => {
    const owner = await member("own-owner", ORG_A, "STUDENT")
    const intruder = await member("own-intruder", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso propiedad")
    const enrollmentId = await enrollStudent(course, ORG_A, owner.id)
    const attemptId = await start(owner, enrollmentId, fixture.assessmentId)
    const session = randomUUID()

    const calls = await Promise.all([
      intruder.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session }),
      intruder.client.rpc("attempt_result", { p_attempt: attemptId }),
      intruder.client.rpc("save_answers_batch", {
        p_attempt: attemptId,
        p_session: session,
        p_answers: [],
      }),
      intruder.client.rpc("submit_attempt", {
        p_attempt: attemptId,
        p_session: session,
        p_answers: [],
      }),
      intruder.client.rpc("student_attempt_view", { p_attempt: attemptId }),
      intruder.client.rpc("release_session", { p_attempt: attemptId, p_session: session }),
      intruder.client.rpc("list_my_attempts", { p_enrollment: enrollmentId }),
    ])

    for (const call of calls) {
      expect(call.error?.code).toBe("42501")
    }
  })

  it("refuses a member of another organization", async () => {
    const owner = await member("own-tenant-owner", ORG_A, "STUDENT")
    const outsider = await member("own-tenant-outsider", ORG_B, "STUDENT")
    const { course, fixture } = await scenario("Curso propiedad tenencia")
    const enrollmentId = await enrollStudent(course, ORG_A, owner.id)
    const attemptId = await start(owner, enrollmentId, fixture.assessmentId)

    const { error } = await outsider.client.rpc("student_attempt_view", { p_attempt: attemptId })
    expect(error?.code).toBe("42501")
  })

  it("cuts off a student whose membership was deactivated (D29)", async () => {
    const student = await member("own-deactivated", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso propiedad inactiva")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const attemptId = await start(student, enrollmentId, fixture.assessmentId)

    await supabaseAdmin
      .from("organization_memberships")
      .update({ status: "INACTIVE" })
      .eq("organization_id", ORG_A)
      .eq("user_id", student.id)

    const { error } = await student.client.rpc("heartbeat", {
      p_attempt: attemptId,
      p_session: randomUUID(),
    })
    expect(error?.code).toBe("42501")
  })
})

describe("the finalizers are not callable by clients (D25)", () => {
  it("denies finalize_attempt and finalize_expired_attempts to a student and an admin", async () => {
    const student = await member("final-student", ORG_A, "STUDENT")
    const admin = await member("final-admin", ORG_A, "ADMIN")
    const { course, fixture } = await scenario("Curso finalizadores")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const attemptId = await start(student, enrollmentId, fixture.assessmentId)

    const studentFinalize = await student.client.rpc("finalize_attempt", {
      p_attempt: attemptId,
      p_reason: "SUBMITTED",
    })
    const studentSweep = await student.client.rpc("finalize_expired_attempts")
    const adminFinalize = await admin.client.rpc("finalize_attempt", {
      p_attempt: attemptId,
      p_reason: "AUTO",
    })

    expect(studentFinalize.error).not.toBeNull()
    expect(studentSweep.error).not.toBeNull()
    expect(adminFinalize.error).not.toBeNull()

    // And the attempt is untouched.
    const { data } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status")
      .eq("id", attemptId)
      .single()
    expect(data!.status).toBe("IN_PROGRESS")
  })
})
