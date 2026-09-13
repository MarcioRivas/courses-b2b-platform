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
import type { TestUser } from "../helpers/make-user"

/**
 * Grading (B12/D15), the QUIZ/TASK completion loop (D33), the QUIZ_PASSED
 * unlock that replaces Phase 4's stub, and the C10 deletion guards.
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

async function makeProfessorCourse(title: string, professor: TestUser) {
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)
  await supabaseAdmin
    .from("course_professors")
    .insert({ course_id: course.courseId, user_id: professor.id })
  return course
}

async function submitOpenAttempt(student: TestUser, enrollmentId: string, assessmentId: string) {
  const { data: attemptId, error } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: assessmentId,
  })
  if (error || !attemptId) throw error ?? new Error("attempt not started")

  const session = randomUUID()
  await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })

  const { data: questions } = await supabaseAdmin
    .from("assessment_attempt_questions")
    .select("id, type")
    .eq("attempt_id", attemptId)
    .order("position")

  const answers = (questions ?? [])
    .filter((q) => q.type === "OPEN_ENDED")
    .map((q, i) => ({ attempt_question_id: q.id, text_answer: "mi respuesta", client_seq: i + 1 }))

  await student.client.rpc("submit_attempt", {
    p_attempt: attemptId,
    p_session: session,
    p_answers: answers,
  })

  return { attemptId, questions: questions ?? [] }
}

describe("grade_open_answer", () => {
  it("grades the open answer and flips the attempt to GRADED when none remain", async () => {
    const professor = await member("grade-prof", ORG_A, "PROFESSOR")
    const student = await member("grade-student", ORG_A, "STUDENT")
    const course = await makeProfessorCourse("Curso corrección", professor)

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Evaluación abierta",
      kind: "TASK",
      openEnded: 1,
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { attemptId, questions } = await submitOpenAttempt(student, enrollmentId, fixture.assessmentId)
    const openQuestion = questions.find((q) => q.type === "OPEN_ENDED")!

    const { data: before } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status")
      .eq("id", attemptId)
      .single()
    expect(before!.status).toBe("SUBMITTED")

    const { data, error } = await professor.client.rpc("grade_open_answer", {
      p_attempt: attemptId,
      p_attempt_question: openQuestion.id,
      p_points: 1,
      p_feedback: "Bien argumentado.",
    })

    expect(error).toBeNull()
    expect(data![0]!.status).toBe("GRADED")

    // Now — and only now — the student can see the result.
    const { data: view } = await student.client.rpc("student_attempt_view", { p_attempt: attemptId })
    const graded = (view ?? []).find((r) => r.attempt_question_id === openQuestion.id)
    expect(Number(graded!.points_awarded)).toBe(1)
    expect(graded!.feedback).toBe("Bien argumentado.")
  })

  it("refuses points above the question's maximum", async () => {
    const professor = await member("grade-max-prof", ORG_A, "PROFESSOR")
    const student = await member("grade-max-student", ORG_A, "STUDENT")
    const course = await makeProfessorCourse("Curso máximo", professor)
    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Evaluación máximo",
      kind: "TASK",
      openEnded: 1,
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { attemptId, questions } = await submitOpenAttempt(student, enrollmentId, fixture.assessmentId)

    const { error } = await professor.client.rpc("grade_open_answer", {
      p_attempt: attemptId,
      p_attempt_question: questions[0]!.id,
      p_points: 99,
    })
    expect(error?.message).toContain("INVALID_ANSWER")
  })

  it("refuses a professor from another course, and a student grading themselves", async () => {
    const professor = await member("grade-own-prof", ORG_A, "PROFESSOR")
    const outsiderProf = await member("grade-other-prof", ORG_A, "PROFESSOR")
    const foreignAdmin = await member("grade-foreign-admin", ORG_B, "ADMIN")
    const student = await member("grade-own-student", ORG_A, "STUDENT")
    const course = await makeProfessorCourse("Curso ajeno corrección", professor)
    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Evaluación ajena",
      kind: "TASK",
      openEnded: 1,
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { attemptId, questions } = await submitOpenAttempt(student, enrollmentId, fixture.assessmentId)

    const calls = await Promise.all([
      outsiderProf.client.rpc("grade_open_answer", {
        p_attempt: attemptId,
        p_attempt_question: questions[0]!.id,
        p_points: 1,
      }),
      foreignAdmin.client.rpc("grade_open_answer", {
        p_attempt: attemptId,
        p_attempt_question: questions[0]!.id,
        p_points: 1,
      }),
      student.client.rpc("grade_open_answer", {
        p_attempt: attemptId,
        p_attempt_question: questions[0]!.id,
        p_points: 1,
      }),
    ])

    for (const call of calls) {
      expect(call.error?.code).toBe("42501")
    }
  })

  it("refuses to grade an attempt still in progress", async () => {
    const professor = await member("grade-inflight-prof", ORG_A, "PROFESSOR")
    const student = await member("grade-inflight-student", ORG_A, "STUDENT")
    const course = await makeProfessorCourse("Curso en curso", professor)
    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Evaluación en curso",
      kind: "TASK",
      openEnded: 1,
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const { data: questions } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id")
      .eq("attempt_id", attemptId!)

    const { error } = await professor.client.rpc("grade_open_answer", {
      p_attempt: attemptId!,
      p_attempt_question: questions![0]!.id,
      p_points: 1,
    })
    expect(error?.message).toContain("ATTEMPT_IN_PROGRESS")
  })
})

describe("QUIZ/TASK completion writes content_progress (D33)", () => {
  it("completes the linked block on submit and moves the progress cache", async () => {
    const student = await member("quiz-block", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso bloque quiz",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Quiz de bloque",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const { data: block } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({
        lesson_id: course.modules[0]!.lessonId,
        type: "QUIZ",
        position: 50,
        data: {},
        assessment_id: fixture.assessmentId,
        is_required: true,
      })
      .select("id")
      .single()

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId!, p_session: session })
    await student.client.rpc("submit_attempt", {
      p_attempt: attemptId!,
      p_session: session,
      p_answers: [],
    })

    const { data: progress } = await supabaseAdmin
      .from("content_progress")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .eq("content_block_id", block!.id)
    expect(progress ?? []).toHaveLength(1)

    const { data: enrollment } = await supabaseAdmin
      .from("course_enrollments")
      .select("completed_blocks, progress_percent")
      .eq("id", enrollmentId)
      .single()
    expect(enrollment!.completed_blocks).toBeGreaterThan(0)
  })

  it("a student still cannot tick a QUIZ block by hand", async () => {
    const student = await member("quiz-manual", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso quiz manual",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Quiz manual",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const { data: block } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({
        lesson_id: course.modules[0]!.lessonId,
        type: "QUIZ",
        position: 51,
        data: {},
        assessment_id: fixture.assessmentId,
        is_required: true,
      })
      .select("id")
      .single()

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { error } = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: block!.id,
      p_completed: true,
    })
    expect(error?.message).toContain("INVALID_BLOCK_TYPE")
  })

  it("a failed QUIZ with a passing score does NOT complete its block", async () => {
    const student = await member("quiz-failed", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso quiz reprobado",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Quiz reprobado",
      kind: "QUIZ",
      multipleChoice: 2,
      passingScore: 80,
    })
    bankIds.push(fixture.bankId)

    const { data: block } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({
        lesson_id: course.modules[0]!.lessonId,
        type: "QUIZ",
        position: 52,
        data: {},
        assessment_id: fixture.assessmentId,
        is_required: true,
      })
      .select("id")
      .single()

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId!, p_session: session })
    // Submitting nothing scores 0%.
    await student.client.rpc("submit_attempt", {
      p_attempt: attemptId!,
      p_session: session,
      p_answers: [],
    })

    const { data: progress } = await supabaseAdmin
      .from("content_progress")
      .select("id")
      .eq("enrollment_id", enrollmentId)
      .eq("content_block_id", block!.id)
    expect(progress ?? []).toHaveLength(0)
  })
})

describe("QUIZ_PASSED unlocks a module (completes the Phase 4 stub)", () => {
  it("locks the module until the quiz is passed, then opens it", async () => {
    const student = await member("unlock-quiz", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso desbloqueo quiz",
      modules: [
        { title: "Módulo 1", requiredBlocks: 1 },
        { title: "Módulo 2", requiredBlocks: 1 },
      ],
    })
    courseIds.push(course.courseId)

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Quiz desbloqueante",
      kind: "QUIZ",
      multipleChoice: 2,
    })
    bankIds.push(fixture.bankId)

    await supabaseAdmin.from("module_dependencies").insert({
      module_id: course.modules[1]!.id,
      condition: "QUIZ_PASSED",
      assessment_id: fixture.assessmentId,
      min_score: 60,
    })

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const before = await student.client.rpc("module_unlock_state", { p_enrollment: enrollmentId })
    const lockedRow = (before.data ?? []).find((r) => r.module_id === course.modules[1]!.id)
    expect(lockedRow!.state).toBe("LOCKED_DEPENDENCY")
    expect(lockedRow!.reason).toContain("Quiz desbloqueante")

    // A failing attempt leaves it locked.
    const { data: firstAttempt } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: firstAttempt!, p_session: session })
    await student.client.rpc("submit_attempt", {
      p_attempt: firstAttempt!,
      p_session: session,
      p_answers: [],
    })

    const afterFail = await student.client.rpc("module_unlock_state", { p_enrollment: enrollmentId })
    expect((afterFail.data ?? []).find((r) => r.module_id === course.modules[1]!.id)!.state).toBe(
      "LOCKED_DEPENDENCY"
    )

    // Now pass it.
    const { data: secondAttempt } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const { data: snapshot } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id, question_id")
      .eq("attempt_id", secondAttempt!)

    await student.client.rpc("heartbeat", { p_attempt: secondAttempt!, p_session: session })
    await student.client.rpc("submit_attempt", {
      p_attempt: secondAttempt!,
      p_session: session,
      p_answers: (snapshot ?? []).map((row, i) => ({
        attempt_question_id: row.id,
        selected_option_id: fixture.questions.find((q) => q.questionId === row.question_id)!.correctOptionId,
        client_seq: i + 1,
      })),
    })

    const afterPass = await student.client.rpc("module_unlock_state", { p_enrollment: enrollmentId })
    expect((afterPass.data ?? []).find((r) => r.module_id === course.modules[1]!.id)!.state).toBe(
      "AVAILABLE"
    )
  })
})

describe("deletion guards (C10)", () => {
  it("refuses to delete an assessment that has attempts", async () => {
    const admin = await member("delete-admin", ORG_A, "ADMIN")
    const student = await member("delete-student", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso borrar evaluación",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Evaluación con intentos",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })

    const { error } = await admin.client.rpc("delete_assessment", {
      p_assessment: fixture.assessmentId,
    })
    expect(error?.message).toContain("CONFLICT_HAS_ATTEMPTS")

    const { data } = await supabaseAdmin
      .from("assessments")
      .select("id")
      .eq("id", fixture.assessmentId)
    expect(data ?? []).toHaveLength(1)
  })

  it("deletes a clean assessment", async () => {
    const admin = await member("delete-clean-admin", ORG_A, "ADMIN")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso borrar limpio",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Evaluación limpia",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const { error } = await admin.client.rpc("delete_assessment", {
      p_assessment: fixture.assessmentId,
    })
    expect(error).toBeNull()
  })
})

describe("extend_assessment_window (D32)", () => {
  it("moves in-flight attempts' deadlines, not just the assessment's", async () => {
    const professor = await member("extend-prof", ORG_A, "PROFESSOR")
    const student = await member("extend-student", ORG_A, "STUDENT")
    const course = await makeProfessorCourse("Curso extender", professor)

    // Opened an hour ago and closing in an hour: this test is about EXTENDING
    // a window, not about its boundaries (start-attempt-rules.test.ts owns
    // those), so the margins are wide enough that a container clock a minute
    // out of step with the host cannot turn it into ASSESSMENT_EXPIRED.
    const until = new Date(Date.now() + 3_600_000).toISOString()
    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Examen extendible",
      kind: "EXAM",
      multipleChoice: 1,
      durationSeconds: 360000,
      availableFrom: new Date(Date.now() - 3_600_000).toISOString(),
      availableUntil: until,
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { data: attemptId, error: startError } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(startError).toBeNull()
    expect(attemptId).toBeTruthy()

    // Duration is 10h but the window closes in 10 minutes, so the window wins.
    const { data: before } = await supabaseAdmin
      .from("assessment_attempts")
      .select("effective_end_at")
      .eq("id", attemptId!)
      .single()
    expect(new Date(before!.effective_end_at!).getTime()).toBe(new Date(until).getTime())

    const newUntil = new Date(Date.now() + 7_200_000).toISOString()
    const { data: updated, error } = await professor.client.rpc("extend_assessment_window", {
      p_assessment: fixture.assessmentId,
      p_new_until: newUntil,
    })
    expect(error).toBeNull()
    expect(updated).toBe(1)

    const { data: after } = await supabaseAdmin
      .from("assessment_attempts")
      .select("effective_end_at")
      .eq("id", attemptId!)
      .single()
    expect(new Date(after!.effective_end_at!).getTime()).toBe(new Date(newUntil).getTime())
  })

  it("refuses a student and refuses moving the deadline backwards", async () => {
    const professor = await member("extend-back-prof", ORG_A, "PROFESSOR")
    const student = await member("extend-back-student", ORG_A, "STUDENT")
    const course = await makeProfessorCourse("Curso extender atrás", professor)

    const until = new Date(Date.now() + 3_600_000).toISOString()
    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Examen no retrocede",
      kind: "EXAM",
      multipleChoice: 1,
      durationSeconds: 600,
      availableFrom: new Date(Date.now() - 3_600_000).toISOString(),
      availableUntil: until,
    })
    bankIds.push(fixture.bankId)

    const byStudent = await student.client.rpc("extend_assessment_window", {
      p_assessment: fixture.assessmentId,
      p_new_until: new Date(Date.now() + 7_200_000).toISOString(),
    })
    expect(byStudent.error?.code).toBe("42501")

    const backwards = await professor.client.rpc("extend_assessment_window", {
      p_assessment: fixture.assessmentId,
      p_new_until: new Date(Date.now() + 600_000).toISOString(),
    })
    expect(backwards.error?.message).toContain("INVALID_ANSWER")
  })
})
