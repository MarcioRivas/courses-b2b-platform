import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { makeAssessmentFixture, makeCourseFixture, cleanupFixtures, assignOfferingProfessor } from "../helpers/course-fixtures"
import { psqlBool } from "../helpers/sql"
import type { TestUser } from "../helpers/make-user"

/**
 * M2 fix (code review 260913): `replace_question_options` and
 * `set_assessment_questions` make the replace-all authoring writes atomic
 * and re-validate ownership/active status server-side.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

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
  await assignOfferingProfessor(course.offeringId, professor.id)
  return course
}

async function makeMcFixture(courseId: string, title: string) {
  const fixture = await makeAssessmentFixture({
    courseId,
    organizationId: ORG_A,
    title,
    kind: "QUIZ",
    multipleChoice: 1,
  })
  bankIds.push(fixture.bankId)
  return fixture
}

describe("replace_question_options", () => {
  it("professor replaces options atomically", async () => {
    const professor = await member("rqo-prof", ORG_A, "PROFESSOR")
    const course = await makeProfessorCourse("Curso RQO", professor)
    const fixture = await makeMcFixture(course.courseId, "Eval RQO")
    const questionId = fixture.questions[0]!.questionId

    const { error } = await professor.client.rpc("replace_question_options", {
      p_question: questionId,
      p_options: [
        { label: "A", position: 1, is_correct: false },
        { label: "B", position: 2, is_correct: true },
        { label: "C", position: 3, is_correct: false },
        { label: "D", position: 4, is_correct: false },
      ],
    })
    expect(error).toBeNull()

    const { data: options } = await supabaseAdmin
      .from("question_options")
      .select("label, is_correct")
      .eq("question_id", questionId)
    expect(options).toHaveLength(4)
    expect(options?.filter((o) => o.is_correct)).toHaveLength(1)
  })

  it("rejects an invalid payload (two correct options) and leaves old options intact", async () => {
    const professor = await member("rqo-prof-2", ORG_A, "PROFESSOR")
    const course = await makeProfessorCourse("Curso RQO 2", professor)
    const fixture = await makeMcFixture(course.courseId, "Eval RQO 2")
    const questionId = fixture.questions[0]!.questionId

    const { error } = await professor.client.rpc("replace_question_options", {
      p_question: questionId,
      p_options: [
        { label: "A", position: 1, is_correct: true },
        { label: "B", position: 2, is_correct: true },
      ],
    })
    expect(error?.code).toBe("22023") // invalid_parameter_value (INVALID_ANSWER)

    const { data: options } = await supabaseAdmin.from("question_options").select("id").eq("question_id", questionId)
    expect(options).toHaveLength(3) // fixture's original 3 options, untouched
  })

  it("forbids a professor who is not assigned to the question's course", async () => {
    const owner = await member("rqo-owner", ORG_A, "PROFESSOR")
    const outsider = await member("rqo-outsider", ORG_A, "PROFESSOR")
    const course = await makeProfessorCourse("Curso RQO Owner", owner)
    const fixture = await makeMcFixture(course.courseId, "Eval RQO Owner")
    const questionId = fixture.questions[0]!.questionId

    const { error } = await outsider.client.rpc("replace_question_options", {
      p_question: questionId,
      p_options: [
        { label: "A", position: 1, is_correct: true },
        { label: "B", position: 2, is_correct: false },
      ],
    })
    expect(error?.code).toBe("42501") // insufficient_privilege

    const { data: options } = await supabaseAdmin.from("question_options").select("id").eq("question_id", questionId)
    expect(options).toHaveLength(3) // untouched
  })

  it("forbids a student", async () => {
    const professor = await member("rqo-prof-3", ORG_A, "PROFESSOR")
    const student = await member("rqo-student", ORG_A, "STUDENT")
    const course = await makeProfessorCourse("Curso RQO 3", professor)
    const fixture = await makeMcFixture(course.courseId, "Eval RQO 3")
    const questionId = fixture.questions[0]!.questionId

    const { error } = await student.client.rpc("replace_question_options", {
      p_question: questionId,
      p_options: [
        { label: "A", position: 1, is_correct: true },
        { label: "B", position: 2, is_correct: false },
      ],
    })
    expect(error?.code).toBe("42501") // insufficient_privilege
  })
})

describe("set_assessment_questions", () => {
  it("rejects a question from a bank the caller cannot edit", async () => {
    const professorA = await member("saq-prof-a", ORG_A, "PROFESSOR")
    const professorB = await member("saq-prof-b", ORG_A, "PROFESSOR")
    const courseA = await makeProfessorCourse("Curso SAQ A", professorA)
    const courseB = await makeProfessorCourse("Curso SAQ B", professorB)

    const fixtureA = await makeMcFixture(courseA.courseId, "Eval SAQ A")
    const fixtureB = await makeAssessmentFixture({
      courseId: courseB.courseId,
      organizationId: ORG_A,
      title: "Eval SAQ B",
      kind: "QUIZ",
    })
    bankIds.push(fixtureB.bankId)

    const { error } = await professorB.client.rpc("set_assessment_questions", {
      p_assessment: fixtureB.assessmentId,
      p_items: [{ question_id: fixtureA.questions[0]!.questionId, position: 1, points: 1 }],
    })
    expect(error?.code).toBe("22023") // invalid_parameter_value (question not in an editable bank)

    const { data: rows } = await supabaseAdmin
      .from("assessment_questions")
      .select("id")
      .eq("assessment_id", fixtureB.assessmentId)
    expect(rows).toHaveLength(0)
  })
})

describe("anon cannot execute the authoring RPCs", () => {
  it("has_function_privilege('anon', ..., 'EXECUTE') is false for both", () => {
    expect(psqlBool("select has_function_privilege('anon', 'replace_question_options(uuid, jsonb)', 'EXECUTE');")).toBe(
      false
    )
    expect(
      psqlBool("select has_function_privilege('anon', 'set_assessment_questions(uuid, jsonb)', 'EXECUTE');")
    ).toBe(false)
  })
})
