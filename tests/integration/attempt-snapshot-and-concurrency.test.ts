import { afterAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  cleanupFixtures,
} from "../helpers/course-fixtures"

/**
 * The snapshot is the promise that an exam cannot change under a student
 * mid-attempt (§22, §25), and the partial unique index is the promise that two
 * clicks cannot become two attempts.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

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
    multipleChoice: spec.multipleChoice ?? 2,
    openEnded: spec.openEnded ?? 0,
  })
  bankIds.push(fixture.bankId)
  return { course, fixture }
}

describe("snapshot immutability (§22)", () => {
  it("keeps the attempt's questions and wording when the bank is edited mid-attempt", async () => {
    const student = await member("snapshot-edit", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso inmutable")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })

    const { data: before } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id, prompt, options, points")
      .eq("attempt_id", attemptId!)
      .order("position")

    // The professor rewrites the question and retires it, mid-exam.
    await supabaseAdmin
      .from("questions")
      .update({ prompt: "PREGUNTA REESCRITA", default_points: 99, is_active: false })
      .eq("id", fixture.questions[0]!.questionId)
    await supabaseAdmin
      .from("question_options")
      .update({ label: "ETIQUETA NUEVA" })
      .eq("question_id", fixture.questions[0]!.questionId)

    const { data: after } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id, prompt, options, points")
      .eq("attempt_id", attemptId!)
      .order("position")

    expect(after).toEqual(before)
    expect(after![0]!.prompt).not.toContain("REESCRITA")
  })

  it("preserves saved answers and the deadline across a resume", async () => {
    const student = await member("snapshot-resume", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso reanudación")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId!, p_session: session })

    const { data: questions } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id, options")
      .eq("attempt_id", attemptId!)
      .order("position")
    const first = questions![0]!
    const chosen = (first.options as { id: string }[])[1]!

    await student.client.rpc("save_answers_batch", {
      p_attempt: attemptId!,
      p_session: session,
      p_answers: [{ attempt_question_id: first.id, selected_option_id: chosen.id, client_seq: 1 }],
    })

    const { data: end } = await supabaseAdmin
      .from("assessment_attempts")
      .select("effective_end_at")
      .eq("id", attemptId!)
      .single()

    // "Killing the browser" and coming back is just calling start again.
    const { data: resumed } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(resumed).toBe(attemptId)

    const { data: view } = await student.client.rpc("student_attempt_view", { p_attempt: attemptId! })
    const resumedFirst = (view ?? []).find((row) => row.attempt_question_id === first.id)
    expect(resumedFirst!.selected_option_id).toBe(chosen.id)

    const { data: endAfter } = await supabaseAdmin
      .from("assessment_attempts")
      .select("effective_end_at")
      .eq("id", attemptId!)
      .single()
    expect(endAfter!.effective_end_at).toBe(end!.effective_end_at)
  })

  it("survives the question being deleted from the bank (RESTRICT protects history)", async () => {
    const student = await member("snapshot-delete", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso borrado pregunta")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })

    const { error } = await supabaseAdmin
      .from("questions")
      .delete()
      .eq("id", fixture.questions[0]!.questionId)

    // 23503: the snapshot's RESTRICT FK refuses to let history be erased.
    expect(error?.code).toBe("23503")
  })
})

describe("start_attempt concurrency", () => {
  it("two parallel starts yield ONE attempt", async () => {
    const student = await member("concurrency-start", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso concurrente")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const [a, b, c] = await Promise.all([
      student.client.rpc("start_attempt", {
        p_enrollment: enrollmentId,
        p_assessment: fixture.assessmentId,
      }),
      student.client.rpc("start_attempt", {
        p_enrollment: enrollmentId,
        p_assessment: fixture.assessmentId,
      }),
      student.client.rpc("start_attempt", {
        p_enrollment: enrollmentId,
        p_assessment: fixture.assessmentId,
      }),
    ])

    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(c.error).toBeNull()
    expect(new Set([a.data, b.data, c.data]).size).toBe(1)

    const { count } = await supabaseAdmin
      .from("assessment_attempts")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
    expect(count).toBe(1)

    // And exactly one snapshot was written, not three.
    const { count: questionCount } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", a.data!)
    expect(questionCount).toBe(2)
  })

  it("a second attempt after finishing the first gets attempt_number 2", async () => {
    const student = await member("concurrency-number", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso numeración")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const session = randomUUID()

    const { data: firstId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    await student.client.rpc("heartbeat", { p_attempt: firstId!, p_session: session })
    await student.client.rpc("submit_attempt", {
      p_attempt: firstId!,
      p_session: session,
      p_answers: [],
    })

    const { data: secondId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(secondId).not.toBe(firstId)

    const { data } = await supabaseAdmin
      .from("assessment_attempts")
      .select("attempt_number")
      .eq("id", secondId!)
      .single()
    expect(data!.attempt_number).toBe(2)
  })
})

describe("scoring edge cases", () => {
  it("a zero-point assessment yields a NULL percent, not a division error", async () => {
    const student = await member("score-zero", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso sin puntos",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)

    // An assessment with no questions at all: max_score is 0.
    const fixture = await makeAssessmentFixture({
      offeringId: course.offeringId,
      organizationId: ORG_A,
      title: "Evaluación vacía",
      kind: "QUIZ",
      multipleChoice: 0,
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId!, p_session: session })

    const { data, error } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId!,
      p_session: session,
      p_answers: [],
    })

    expect(error).toBeNull()
    expect(data![0]!.score_percent).toBeNull()
    expect(data![0]!.score_label).toBeNull()
  })

  it("scores an all-correct MC attempt at 100% with the org's label", async () => {
    const student = await member("score-full", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso puntaje completo", { multipleChoice: 2 })
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId!, p_session: session })

    // Answer every question with its real correct option, resolved through the
    // service role — the student's own session can never see this.
    const { data: snapshot } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id, question_id")
      .eq("attempt_id", attemptId!)

    const answers = (snapshot ?? []).map((row, index) => ({
      attempt_question_id: row.id,
      selected_option_id: fixture.questions.find((q) => q.questionId === row.question_id)!.correctOptionId,
      client_seq: index + 1,
    }))

    const { data } = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId!,
      p_session: session,
      p_answers: answers,
    })

    expect(data![0]!.status).toBe("GRADED")
    expect(Number(data![0]!.score_percent)).toBe(100)
    // Seeded org A scale labels 100% — asserting it is non-null proves
    // resolve_score_label was actually consulted.
    expect(data![0]!.score_label).toBeTruthy()
  })
})
