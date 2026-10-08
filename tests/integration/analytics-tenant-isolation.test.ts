import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { psqlBool } from "../helpers/sql"
import { makeAssessmentFixture, makeCourseFixture, cleanupFixtures, assignOfferingProfessor } from "../helpers/course-fixtures"

/**
 * Phase 6 (D25): every `p_org` analytics function must resolve/assert the
 * org itself — a caller-supplied org id may only narrow a platform-admin
 * query, never widen a tenant one. `assessment_score_distribution` derives
 * org/course from the assessment row before asserting, so it is exercised
 * with a real cross-org assessment rather than a bare uuid.
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

describe("org-scoped functions reject a foreign org id", () => {
  it("org A's admin cannot read org B's overview/course/professor/assessment stats", async () => {
    const adminA = await member("iso-admin-a", ORG_A, "ADMIN")

    const calls = await Promise.all([
      adminA.client.rpc("org_overview_stats", { p_org: ORG_B }),
      adminA.client.rpc("org_course_stats", { p_org: ORG_B }),
      adminA.client.rpc("org_professor_stats", { p_org: ORG_B }),
      adminA.client.rpc("org_assessment_stats", { p_org: ORG_B }),
    ])

    for (const call of calls) {
      expect(call.error?.code).toBe("42501")
    }
  })

  it("a student is refused every p_org function, even for their own org", async () => {
    const student = await member("iso-student", ORG_A, "STUDENT")

    const calls = await Promise.all([
      student.client.rpc("org_overview_stats", { p_org: ORG_A }),
      student.client.rpc("org_course_stats", { p_org: ORG_A }),
      student.client.rpc("org_professor_stats", { p_org: ORG_A }),
      student.client.rpc("org_assessment_stats", { p_org: ORG_A }),
    ])

    for (const call of calls) {
      expect(call.error?.code).toBe("42501")
    }
  })

  // A professor is not an org admin: the four `org_*` functions must refuse
  // them too, even for their own org (only `professor_overview_stats`, with
  // no `p_org`, is theirs to call — B12).
  it("a professor is refused every org_* function, even for their own org", async () => {
    const professor = await member("iso-professor", ORG_A, "PROFESSOR")

    const calls = await Promise.all([
      professor.client.rpc("org_overview_stats", { p_org: ORG_A }),
      professor.client.rpc("org_course_stats", { p_org: ORG_A }),
      professor.client.rpc("org_professor_stats", { p_org: ORG_A }),
      professor.client.rpc("org_assessment_stats", { p_org: ORG_A }),
    ])

    for (const call of calls) {
      expect(call.error?.code).toBe("42501")
    }
  })
})

describe("anon cannot execute any analytics RPC", () => {
  it("has_function_privilege('anon', ..., 'EXECUTE') is false for all 7 functions", () => {
    const signatures = [
      "org_overview_stats(uuid)",
      "org_course_stats(uuid)",
      "org_professor_stats(uuid)",
      "org_assessment_stats(uuid)",
      "assessment_score_distribution(uuid)",
      "platform_org_stats()",
      "professor_overview_stats()",
    ]

    for (const signature of signatures) {
      expect(psqlBool(`select has_function_privilege('anon', '${signature}', 'EXECUTE');`)).toBe(false)
    }
  })
})

describe("assessment_score_distribution derives org/course from the row (D25)", () => {
  it("refuses org A's admin on org B's assessment", async () => {
    const adminA = await member("iso-dist-admin", ORG_A, "ADMIN")
    const course = await makeCourseFixture({
      organizationId: ORG_B,
      title: "Curso aislamiento",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_B,
      title: "Evaluación aislamiento",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const { error } = await adminA.client.rpc("assessment_score_distribution", {
      p_assessment: fixture.assessmentId,
    })
    expect(error?.code).toBe("42501")
  })

  it("refuses a student entirely, even in their own org", async () => {
    const student = await member("iso-dist-student", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso aislamiento estudiante",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Evaluación aislamiento estudiante",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)

    const { error } = await student.client.rpc("assessment_score_distribution", {
      p_assessment: fixture.assessmentId,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("professor_overview_stats never returns org-wide numbers (B12)", () => {
  it("a professor with no assigned courses sees an empty list", async () => {
    const professor = await member("iso-prof-empty", ORG_A, "PROFESSOR")
    const { data, error } = await professor.client.rpc("professor_overview_stats")
    expect(error).toBeNull()
    expect(data ?? []).toHaveLength(0)
  })

  it("a professor assigned in org B only ever sees their own org's course", async () => {
    const professorB = await member("iso-prof-b", ORG_B, "PROFESSOR")
    const course = await makeCourseFixture({
      organizationId: ORG_B,
      title: "Curso profesor B",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    await assignOfferingProfessor(course.offeringId, professorB.id)

    const { data } = await professorB.client.rpc("professor_overview_stats")
    expect(data).toHaveLength(1)
    expect(data![0]!.course_id).toBe(course.courseId)
  })
})

describe("platform_org_stats is platform-admin only", () => {
  it("denies an org admin, a professor and a student", async () => {
    const adminA = await member("iso-platform-admin", ORG_A, "ADMIN")
    const professor = await member("iso-platform-prof", ORG_A, "PROFESSOR")
    const student = await member("iso-platform-student", ORG_A, "STUDENT")

    const calls = await Promise.all([
      adminA.client.rpc("platform_org_stats"),
      professor.client.rpc("platform_org_stats"),
      student.client.rpc("platform_org_stats"),
    ])

    for (const call of calls) {
      expect(call.error?.code).toBe("42501")
    }
  })
})
