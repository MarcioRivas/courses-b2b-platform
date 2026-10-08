import { afterAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  cleanupFixtures,
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  assignOfferingProfessor,
} from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"

/**
 * Regressions for the Phase 5C security gate (code-reviewer 260912-0221).
 * Each test here failed before its fix; none of them can be satisfied by the
 * table-level probes the earlier suites use.
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

async function openAttempt(student: TestUser, title: string, openEnded = 1) {
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
    kind: "EXAM",
    multipleChoice: 1,
    openEnded,
    durationSeconds: 3600,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 3600000).toISOString(),
  })
  bankIds.push(fixture.bankId)

  const enrollmentId = await enrollStudent(course, ORG_A, student.id)
  const { data: attemptId, error } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: fixture.assessmentId,
  })
  if (error || !attemptId) throw error ?? new Error("attempt not started")

  return { course, fixture, enrollmentId, attemptId }
}

describe("B1: assert_attempt_owner is not a score oracle", () => {
  it("is not executable by a student, so a SUBMITTED attempt's score stays hidden", async () => {
    const student = await member("gate-b1", ORG_A, "STUDENT")
    const { attemptId } = await openAttempt(student, "Curso B1")
    const session = randomUUID()

    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })
    const { data: submitted } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId,
      p_session: session,
      p_answers: [],
    })
    // An open answer keeps it ungraded — the exact window the oracle exploited.
    expect(submitted![0]!.status).toBe("SUBMITTED")

    const { error } = await student.client.rpc("assert_attempt_owner", { p_attempt: attemptId })
    expect(error).not.toBeNull()

    // And the sanctioned read still withholds the score.
    const { data: view } = await student.client.rpc("student_attempt_view", { p_attempt: attemptId })
    expect(view!.every((row) => row.points_awarded === null)).toBe(true)
  })
})

describe("M1: resolve_score_label does not expose another tenant's scale", () => {
  it("is not executable by a signed-in user", async () => {
    const student = await member("gate-m1", ORG_A, "STUDENT")
    const { error } = await student.client.rpc("resolve_score_label", {
      p_org: ORG_B,
      p_percent: 90,
    })
    expect(error).not.toBeNull()
  })
})

describe("H2: a student CAN read their own attempt snapshot", () => {
  it("returns the student's own questions and hides another student's", async () => {
    const owner = await member("gate-h2-owner", ORG_A, "STUDENT")
    const other = await member("gate-h2-other", ORG_A, "STUDENT")
    const { attemptId } = await openAttempt(owner, "Curso H2")

    // Before the fix this came back empty: the policy's EXISTS ran against
    // `assessment_attempts`, which students cannot SELECT, so it was never true.
    const { data: mine } = await owner.client
      .from("assessment_attempt_questions")
      .select("id")
      .eq("attempt_id", attemptId)
    expect((mine ?? []).length).toBeGreaterThan(0)

    const { data: theirs } = await other.client
      .from("assessment_attempt_questions")
      .select("id")
      .eq("attempt_id", attemptId)
    expect(theirs ?? []).toHaveLength(0)
  })

  it("exposes client_seq so a resumed player does not lose every later save", async () => {
    const student = await member("gate-h2b", ORG_A, "STUDENT")
    const { attemptId } = await openAttempt(student, "Curso H2b")
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })

    const { data: questions } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id")
      .eq("attempt_id", attemptId)
      .order("position")

    await student.client.rpc("save_answers_batch", {
      p_attempt: attemptId,
      p_session: session,
      p_answers: [{ attempt_question_id: questions![0]!.id, text_answer: "hola", client_seq: 7 }],
    })

    const { data: view } = await student.client.rpc("student_attempt_view", { p_attempt: attemptId })
    const row = (view ?? []).find((r) => r.attempt_question_id === questions![0]!.id)
    expect(row!.client_seq).toBe(7)
  })
})

describe("H3: attempt_header observes without stealing the session", () => {
  it("reports status and deadline while leaving the active session untouched", async () => {
    const student = await member("gate-h3", ORG_A, "STUDENT")
    const { attemptId } = await openAttempt(student, "Curso H3")
    const tab = randomUUID()

    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: tab })

    const { data, error } = await student.client.rpc("attempt_header", { p_attempt: attemptId })
    expect(error).toBeNull()
    expect(data![0]!.status).toBe("IN_PROGRESS")
    expect(data![0]!.server_now).toBeTruthy()
    // The reading tab did not become the owner.
    expect(data![0]!.active_session_id).toBe(tab)

    // And it carries no score fields at all — it must not become another B1.
    expect(Object.keys(data![0]!)).not.toContain("score_percent")
  })

  it("refuses another student", async () => {
    const owner = await member("gate-h3-owner", ORG_A, "STUDENT")
    const intruder = await member("gate-h3-intruder", ORG_A, "STUDENT")
    const { attemptId } = await openAttempt(owner, "Curso H3 ajeno")

    const { error } = await intruder.client.rpc("attempt_header", { p_attempt: attemptId })
    expect(error?.code).toBe("42501")
  })
})

describe("M5: attempt tables reject direct writes", () => {
  it("denies INSERT and UPDATE from a signed-in student", async () => {
    const student = await member("gate-m5", ORG_A, "STUDENT")
    const { attemptId } = await openAttempt(student, "Curso M5")

    const update = await student.client
      .from("assessment_attempts")
      .update({ score_percent: 100 })
      .eq("id", attemptId)
    const grade = await student.client
      .from("assessment_grades")
      .insert({ attempt_id: attemptId, attempt_question_id: attemptId, points_awarded: 99 })

    expect(update.error).not.toBeNull()
    expect(grade.error).not.toBeNull()

    const { data } = await supabaseAdmin
      .from("assessment_attempts")
      .select("score_percent")
      .eq("id", attemptId)
      .single()
    expect(data!.score_percent).toBeNull()
  })
})

describe("H1: concurrent finalizes on one enrollment do not deadlock", () => {
  it("survives a sweep racing a submit on the same enrollment", async () => {
    const student = await member("gate-h1", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso H1",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)

    // Two assessments sharing ONE enrollment: finalizing both concurrently is
    // what cycled on the enrollment row before the lock order was fixed.
    const first = await makeAssessmentFixture({
      offeringId: course.offeringId,
      organizationId: ORG_A,
      title: "H1 uno",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    const second = await makeAssessmentFixture({
      offeringId: course.offeringId,
      organizationId: ORG_A,
      title: "H1 dos",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(first.bankId, second.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const sessionOne = randomUUID()
    const sessionTwo = randomUUID()

    const { data: attemptOne } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: first.assessmentId,
    })
    const { data: attemptTwo } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: second.assessmentId,
    })
    await student.client.rpc("heartbeat", { p_attempt: attemptOne!, p_session: sessionOne })
    await student.client.rpc("heartbeat", { p_attempt: attemptTwo!, p_session: sessionTwo })

    const results = await Promise.all([
      student.client.rpc("submit_attempt", {
        p_attempt: attemptOne!,
        p_session: sessionOne,
        p_answers: [],
      }),
      student.client.rpc("submit_attempt", {
        p_attempt: attemptTwo!,
        p_session: sessionTwo,
        p_answers: [],
      }),
    ])

    // 40P01 is what this test exists to catch.
    for (const result of results) {
      expect(result.error).toBeNull()
    }
  })
})

describe("M2: completion never crosses tenants", () => {
  it("refuses a block in another edition that points at this assessment, so completion cannot cross", async () => {
    const student = await member("gate-m2", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso M2 propio",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    const foreign = await makeCourseFixture({
      organizationId: ORG_B,
      title: "Curso M2 ajeno",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId, foreign.courseId)

    const fixture = await makeAssessmentFixture({
      offeringId: course.offeringId,
      organizationId: ORG_A,
      title: "M2 evaluación",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    // A block in ORG_B's edition pointing at ORG_A's assessment: the same-edition
    // trigger refuses it outright (B2), which is stronger than ignoring it later.
    const { data: foreignBlock, error: foreignError } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({
        lesson_id: foreign.modules[0]!.lessonId,
        type: "QUIZ",
        position: 60,
        data: {},
        assessment_id: fixture.assessmentId,
        is_required: true,
      })
      .select("id")
      .single()
    expect(foreignError?.message).toContain("CROSS_EDITION_LINK")
    expect(foreignBlock).toBeNull()

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const session = randomUUID()
    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    await student.client.rpc("heartbeat", { p_attempt: attemptId!, p_session: session })
    await student.client.rpc("submit_attempt", {
      p_attempt: attemptId!,
      p_session: session,
      p_answers: [],
    })

    const { data: leaked } = await supabaseAdmin
      .from("content_progress")
      .select("id")
      .eq("enrollment_id", enrollmentId)
    expect(leaked ?? []).toHaveLength(0)
  })
})

describe("B4: submit_attempt does not return a score before GRADED", () => {
  it("masks the score on an ungraded submit, and on every re-submit", async () => {
    const student = await member("gate-b4", ORG_A, "STUDENT")
    const { attemptId, fixture } = await openAttempt(student, "Curso B4")
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })

    // Answer the MC correctly so there IS a non-zero score to leak.
    const { data: snapshot } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id, question_id, type")
      .eq("attempt_id", attemptId)
    const mc = (snapshot ?? []).find((q) => q.type === "MULTIPLE_CHOICE")!

    const { data: first } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId,
      p_session: session,
      p_answers: [
        {
          attempt_question_id: mc.id,
          selected_option_id: fixture.questions.find((q) => q.questionId === mc.question_id)!
            .correctOptionId,
          client_seq: 1,
        },
      ],
    })

    // An open answer keeps it ungraded: status is honest, the score is withheld.
    expect(first![0]!.status).toBe("SUBMITTED")
    expect(first![0]!.total_score).toBeNull()
    expect(first![0]!.score_percent).toBeNull()
    expect(first![0]!.score_label).toBeNull()

    // The idempotent branch was independently re-readable — check it too.
    const { data: again } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId,
      p_session: session,
      p_answers: [],
    })
    expect(again![0]!.status).toBe("SUBMITTED")
    expect(again![0]!.score_percent).toBeNull()

    // The score does exist server-side; it is simply not handed to the student.
    const { data: actual } = await supabaseAdmin
      .from("assessment_attempts")
      .select("score_percent")
      .eq("id", attemptId)
      .single()
    expect(Number(actual!.score_percent)).toBeGreaterThan(0)
  })

  it("still returns the score immediately for an MC-only assessment", async () => {
    const student = await member("gate-b4-mc", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso B4 MC",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)

    const fixture = await makeAssessmentFixture({
      offeringId: course.offeringId,
      organizationId: ORG_A,
      title: "B4 solo MC",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const session = randomUUID()
    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    await student.client.rpc("heartbeat", { p_attempt: attemptId!, p_session: session })

    const { data } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId!,
      p_session: session,
      p_answers: [],
    })

    // Nothing for a human to grade, so GRADED and the score is legitimate.
    expect(data![0]!.status).toBe("GRADED")
    expect(data![0]!.score_percent).not.toBeNull()
  })
})

describe("B5: the sweep and grading share the writers' lock order", () => {
  it("does not deadlock when the sweep races a submit on the same attempt", async () => {
    const student = await member("gate-b5-sweep", ORG_A, "STUDENT")
    const { attemptId } = await openAttempt(student, "Curso B5 barrido", 0)
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })

    // Expire it, then let the sweep and an explicit submit collide on the very
    // same attempt — the case the previous H1 fix did not cover.
    await supabaseAdmin
      .from("assessment_attempts")
      .update({ effective_end_at: new Date(Date.now() - 30_000).toISOString() })
      .eq("id", attemptId)

    const [sweep, submit] = await Promise.all([
      supabaseAdmin.rpc("finalize_expired_attempts"),
      student.client.rpc("submit_attempt", {
        p_attempt: attemptId,
        p_session: session,
        p_answers: [],
      }),
    ])

    expect(sweep.error).toBeNull()
    expect(submit.error).toBeNull()

    const { data } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status")
      .eq("id", attemptId)
      .single()
    expect(data!.status).not.toBe("IN_PROGRESS")
  })

  it("does not deadlock when a professor grades while the sweep runs", async () => {
    const professor = await member("gate-b5-prof", ORG_A, "PROFESSOR")
    const student = await member("gate-b5-student", ORG_A, "STUDENT")
    const { attemptId, course } = await openAttempt(student, "Curso B5 corrección")
    await assignOfferingProfessor(course.offeringId, professor.id)

    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })
    await student.client.rpc("submit_attempt", {
      p_attempt: attemptId,
      p_session: session,
      p_answers: [],
    })

    const { data: open } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id")
      .eq("attempt_id", attemptId)
      .eq("type", "OPEN_ENDED")
      .single()

    const [grade, sweep] = await Promise.all([
      professor.client.rpc("grade_open_answer", {
        p_attempt: attemptId,
        p_attempt_question: open!.id,
        p_points: 1,
      }),
      supabaseAdmin.rpc("finalize_expired_attempts"),
    ])

    expect(grade.error).toBeNull()
    expect(sweep.error).toBeNull()
    expect(grade.data![0]!.status).toBe("GRADED")
  })
})

describe("N1: grade_open_answer authorises before it locks", () => {
  it("answers 42501 identically for a foreign attempt and an imaginary one", async () => {
    const professor = await member("gate-n1-prof", ORG_A, "PROFESSOR")
    const student = await member("gate-n1-student", ORG_A, "STUDENT")
    // A real attempt in a course this professor is NOT assigned to.
    const { attemptId } = await openAttempt(student, "Curso N1")
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })
    await student.client.rpc("submit_attempt", {
      p_attempt: attemptId,
      p_session: session,
      p_answers: [],
    })

    const real = await professor.client.rpc("grade_open_answer", {
      p_attempt: attemptId,
      p_attempt_question: attemptId,
      p_points: 1,
    })
    const imaginary = await professor.client.rpc("grade_open_answer", {
      p_attempt: "00000000-0000-0000-0000-0000000000cc",
      p_attempt_question: attemptId,
      p_points: 1,
    })

    // Distinguishable codes would confirm an attempt uuid exists in another
    // tenant, which is exactly the oracle N1 described.
    expect(real.error?.code).toBe("42501")
    expect(imaginary.error?.code).toBe("42501")
    expect(real.error?.code).toBe(imaginary.error?.code)
  })
})
