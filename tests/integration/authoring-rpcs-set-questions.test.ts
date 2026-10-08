import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { makeAssessmentFixture, makeCourseFixture, cleanupFixtures, assignOfferingProfessor } from "../helpers/course-fixtures"

/**
 * N1 fix (code review 260913, cycle 2): `authoring-rpcs.test.ts` only covered
 * `set_assessment_questions`' cross-bank rejection. This file covers the
 * happy path (atomic replace-all: old rows gone after a second call) and the
 * student-FORBIDDEN case, so the `authenticated`-only grant and the
 * delete+insert transaction are actually exercised.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
})

describe("set_assessment_questions", () => {
  it("professor sets then replaces the fixed question list atomically (old rows gone)", async () => {
    const professor = await member("saq-prof-happy", ORG_A, "PROFESSOR")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso SAQ Happy",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    await assignOfferingProfessor(course.offeringId, professor.id)

    const fixture = await makeAssessmentFixture({
      offeringId: course.offeringId,
      organizationId: ORG_A,
      title: "Eval SAQ Happy",
      kind: "QUIZ",
      multipleChoice: 2,
    })
    bankIds.push(fixture.bankId)
    const [q1, q2] = fixture.questions.map((q) => q.questionId)

    const { error: firstError } = await professor.client.rpc("set_assessment_questions", {
      p_assessment: fixture.assessmentId,
      p_items: [{ question_id: q1, position: 1, points: 2 }],
    })
    expect(firstError).toBeNull()

    const { data: afterFirst } = await supabaseAdmin
      .from("assessment_questions")
      .select("question_id, points")
      .eq("assessment_id", fixture.assessmentId)
    expect(afterFirst).toHaveLength(1)
    expect(afterFirst?.[0]?.question_id).toBe(q1)

    const { error: secondError } = await professor.client.rpc("set_assessment_questions", {
      p_assessment: fixture.assessmentId,
      p_items: [{ question_id: q2, position: 1, points: 3 }],
    })
    expect(secondError).toBeNull()

    const { data: afterSecond } = await supabaseAdmin
      .from("assessment_questions")
      .select("question_id, points")
      .eq("assessment_id", fixture.assessmentId)
    // Old row (q1) is gone — the replace was a delete+insert in one transaction.
    expect(afterSecond).toHaveLength(1)
    expect(afterSecond?.[0]?.question_id).toBe(q2)
    expect(afterSecond?.[0]?.points).toBe(3)
  })

  it("forbids a student", async () => {
    const professor = await member("saq-prof-student", ORG_A, "PROFESSOR")
    const student = await member("saq-student", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso SAQ Student",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    await assignOfferingProfessor(course.offeringId, professor.id)

    const fixture = await makeAssessmentFixture({
      offeringId: course.offeringId,
      organizationId: ORG_A,
      title: "Eval SAQ Student",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const { error } = await student.client.rpc("set_assessment_questions", {
      p_assessment: fixture.assessmentId,
      p_items: [{ question_id: fixture.questions[0]!.questionId, position: 1, points: 1 }],
    })
    expect(error?.code).toBe("42501") // insufficient_privilege

    const { data: rows } = await supabaseAdmin
      .from("assessment_questions")
      .select("id")
      .eq("assessment_id", fixture.assessmentId)
    expect(rows).toHaveLength(1) // the fixture's original row, untouched
  })
})
