import { randomUUID } from "node:crypto"
import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  cleanupFixtures,
} from "../helpers/course-fixtures"
import { buildPendingAttemptsQuery } from "@/features/grading/queries/pending-attempts-query"

/**
 * `list-pending-attempts`'s query shape (5E), replicated against a
 * professor-scoped client to prove RLS (`assessment_attempts_select`) plus
 * the filter/sort logic behave without going through a Server Component.
 * Also asserts a student never reads `assessment_attempts` (D24/F7).
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
})

/** One course, one TASK with a single OPEN_ENDED question, taught by `professorId`. */
async function makeGradableCourse(title: string, professorId: string) {
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)
  await supabaseAdmin.from("course_professors").insert({ course_id: course.courseId, user_id: professorId })

  const fixture = await makeAssessmentFixture({
    courseId: course.courseId,
    organizationId: ORG_A,
    title: `${title} — evaluación`,
    kind: "TASK",
    openEnded: 1,
  })
  bankIds.push(fixture.bankId)

  return { course, fixture }
}

async function submitOpenAttempt(
  student: Awaited<ReturnType<typeof member>>,
  enrollmentId: string,
  assessmentId: string
) {
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

  const answers = (questions ?? [])
    .filter((q) => q.type === "OPEN_ENDED")
    .map((q, i) => ({ attempt_question_id: q.id, text_answer: "mi respuesta", client_seq: i + 1 }))

  await student.client.rpc("submit_attempt", { p_attempt: attemptId, p_session: session, p_answers: answers })

  return attemptId
}

describe("buildPendingAttemptsQuery (5E grading queue)", () => {
  it("lists a professor's own pending attempts, oldest submission first, excluding other courses", async () => {
    const professor = await member("gui-prof", ORG_A, "PROFESSOR")
    const outsiderProf = await member("gui-outsider-prof", ORG_A, "PROFESSOR")
    const studentA = await member("gui-student-a", ORG_A, "STUDENT")
    const studentB = await member("gui-student-b", ORG_A, "STUDENT")

    const { course, fixture } = await makeGradableCourse("Curso cola de corrección", professor.id)
    const { course: otherCourse, fixture: otherFixture } = await makeGradableCourse(
      "Curso de otro profesor",
      outsiderProf.id
    )

    const enrollmentA = await enrollStudent(course, ORG_A, studentA.id)
    const enrollmentB = await enrollStudent(course, ORG_A, studentB.id)
    const enrollmentOther = await enrollStudent(otherCourse, ORG_A, studentA.id)

    // A submits first, B second — the query must return A before B.
    const attemptA = await submitOpenAttempt(studentA, enrollmentA, fixture.assessmentId)
    await new Promise((resolve) => setTimeout(resolve, 1100))
    const attemptB = await submitOpenAttempt(studentB, enrollmentB, fixture.assessmentId)
    // An attempt in a course this professor does NOT teach must never appear.
    await submitOpenAttempt(studentA, enrollmentOther, otherFixture.assessmentId)

    const { data, error, count } = await buildPendingAttemptsQuery(professor.client, {
      statusGroup: "PENDING",
      page: 1,
    })

    expect(error).toBeNull()
    expect(count).toBe(2)
    expect((data ?? []).map((row) => row.id)).toEqual([attemptA, attemptB])
    for (const row of data ?? []) {
      expect(row.assessments?.course_id).toBe(course.courseId)
    }
  })

  it("filters by course and by assessment", async () => {
    const professor = await member("gui-filter-prof", ORG_A, "PROFESSOR")
    const student = await member("gui-filter-student", ORG_A, "STUDENT")

    const { course: courseOne, fixture: fixtureOne } = await makeGradableCourse("Curso filtro 1", professor.id)
    const { course: courseTwo, fixture: fixtureTwo } = await makeGradableCourse("Curso filtro 2", professor.id)

    const enrollmentOne = await enrollStudent(courseOne, ORG_A, student.id)
    const enrollmentTwo = await enrollStudent(courseTwo, ORG_A, student.id)
    const attemptOne = await submitOpenAttempt(student, enrollmentOne, fixtureOne.assessmentId)
    await submitOpenAttempt(student, enrollmentTwo, fixtureTwo.assessmentId)

    const byCourse = await buildPendingAttemptsQuery(professor.client, {
      statusGroup: "PENDING",
      courseId: courseOne.courseId,
      page: 1,
    })
    expect((byCourse.data ?? []).map((row) => row.id)).toEqual([attemptOne])

    const byAssessment = await buildPendingAttemptsQuery(professor.client, {
      statusGroup: "PENDING",
      assessmentId: fixtureOne.assessmentId,
      page: 1,
    })
    expect((byAssessment.data ?? []).map((row) => row.id)).toEqual([attemptOne])
  })

  it("a student cannot read assessment_attempts directly (D24/F7)", async () => {
    const professor = await member("gui-locked-prof", ORG_A, "PROFESSOR")
    const student = await member("gui-locked-student", ORG_A, "STUDENT")
    const { course, fixture } = await makeGradableCourse("Curso lectura bloqueada", professor.id)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    await submitOpenAttempt(student, enrollmentId, fixture.assessmentId)

    const { data, error } = await buildPendingAttemptsQuery(student.client, { statusGroup: "PENDING", page: 1 })

    // RLS denies the SELECT outright: no error, just zero rows (even the student's own attempt).
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })
})
