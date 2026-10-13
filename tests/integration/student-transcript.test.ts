import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { anonClient } from "../helpers/make-user"
import {
  assignOfferingProfessor,
  cleanupFixtures,
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  type CourseFixture,
} from "../helpers/course-fixtures"
import { submitOpenAttempt } from "../helpers/attempt-submission"

/**
 * Student transcript RPCs (staff_student_enrollments, staff_enrollment_assessments,
 * staff_enrollment_activity, staff_enrollment_pending). Real local Supabase.
 * Authorisation is covered in tests/security/rpc-permissions.test.ts.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
})

const M1_BLOCK_A_AT = "2026-10-01T10:00:00.000Z"
const M1_BLOCK_B_AT = "2026-10-03T10:00:00.000Z"

interface Transcript {
  course: CourseFixture
  enrollmentId: string
  student: Awaited<ReturnType<typeof member>>
  professor: Awaited<ReturnType<typeof member>>
  outsiderProfessor: Awaited<ReturnType<typeof member>>
  admin: Awaited<ReturnType<typeof member>>
  orgBAdmin: Awaited<ReturnType<typeof member>>
  attemptId: string
  assessmentId: string
  assessmentTitle: string
  openQuestionId: string
}

/**
 * Edition with two modules. Module 1: two required blocks (both done, dated)
 * plus one OPTIONAL block that is not done (must not block completion).
 * Module 2: one required block, not done. A published EXAM with one open
 * question, submitted and graded by the professor with `points`.
 */
async function buildTranscript(label: string, points: number): Promise<Transcript> {
  const professor = await member(`tr-${label}-prof`, ORG_A, "PROFESSOR")
  const outsiderProfessor = await member(`tr-${label}-outsider`, ORG_A, "PROFESSOR")
  const student = await member(`tr-${label}-student`, ORG_A, "STUDENT")
  const admin = await member(`tr-${label}-admin`, ORG_A, "ADMIN")
  const orgBAdmin = await member(`tr-${label}-orgb`, ORG_B, "ADMIN")

  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso escolaridad ${label}`,
    modules: [
      { title: "Módulo 1", requiredBlocks: 2, optionalBlocks: 1 },
      { title: "Módulo 2", requiredBlocks: 1 },
    ],
  })
  courseIds.push(course.courseId)
  await assignOfferingProfessor(course.offeringId, professor.id)

  const enrollmentId = await enrollStudent(course, ORG_A, student.id)

  const [m1a, m1b] = course.modules[0]!.blockIds
  const { error: progressError } = await supabaseAdmin.from("content_progress").insert([
    { enrollment_id: enrollmentId, content_block_id: m1a!, completed_at: M1_BLOCK_A_AT },
    { enrollment_id: enrollmentId, content_block_id: m1b!, completed_at: M1_BLOCK_B_AT },
  ])
  if (progressError) throw progressError

  const assessmentTitle = `Examen escolaridad ${label}`
  const fixture = await makeAssessmentFixture({
    offeringId: course.offeringId,
    organizationId: ORG_A,
    title: assessmentTitle,
    kind: "EXAM",
    openEnded: 1,
    durationSeconds: 3600,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 3600000).toISOString(),
  })

  const { attemptId, questions } = await submitOpenAttempt(student, enrollmentId, fixture.assessmentId)
  const openQuestionId = questions.find((q) => q.type === "OPEN_ENDED")!.id

  const { error: gradeError } = await professor.client.rpc("grade_attempt_batch", {
    p_attempt: attemptId,
    p_grades: [{ attempt_question_id: openQuestionId, points, feedback: null }],
    p_feedback: "Revisado.",
  })
  if (gradeError) throw gradeError

  return {
    course,
    enrollmentId,
    student,
    professor,
    outsiderProfessor,
    admin,
    orgBAdmin,
    attemptId,
    assessmentId: fixture.assessmentId,
    assessmentTitle,
    openQuestionId,
  }
}

describe("staff_student_enrollments", () => {
  it("returns the student's enrollment to the org admin and the assigned professor", async () => {
    const t = await buildTranscript("enr-ok", 0)

    const asAdmin = await t.admin.client.rpc("staff_student_enrollments", { p_user: t.student.id })
    expect(asAdmin.error).toBeNull()
    expect(asAdmin.data).toHaveLength(1)
    expect(asAdmin.data![0]!.enrollment_id).toBe(t.enrollmentId)
    expect(asAdmin.data![0]!.course_id).toBe(t.course.courseId)
    expect(asAdmin.data![0]!.offering_id).toBe(t.course.offeringId)
    expect(asAdmin.data![0]!.total_blocks).toBe(3)

    const asProfessor = await t.professor.client.rpc("staff_student_enrollments", { p_user: t.student.id })
    expect(asProfessor.error).toBeNull()
    expect(asProfessor.data!.map((r) => r.enrollment_id)).toEqual([t.enrollmentId])
  })

  it("hides the enrollment from a professor not assigned to the edition and from another org's admin", async () => {
    const t = await buildTranscript("enr-hidden", 0)

    const outsider = await t.outsiderProfessor.client.rpc("staff_student_enrollments", { p_user: t.student.id })
    expect(outsider.error).toBeNull()
    expect(outsider.data).toEqual([])

    const otherOrg = await t.orgBAdmin.client.rpc("staff_student_enrollments", { p_user: t.student.id })
    expect(otherOrg.error).toBeNull()
    expect(otherOrg.data).toEqual([])
  })
})

describe("staff_enrollment_assessments", () => {
  it("returns the latest graded attempt with its scale label and pass flag", async () => {
    const t = await buildTranscript("assess", 0)

    const { data, error } = await t.admin.client.rpc("staff_enrollment_assessments", {
      p_enrollment: t.enrollmentId,
    })
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    const row = data![0]!
    expect(row.assessment_id).toBe(t.assessmentId)
    expect(row.title).toBe(t.assessmentTitle)
    expect(row.attempts_used).toBe(1)
    expect(row.last_attempt_id).toBe(t.attemptId)
    expect(row.last_status).toBe("GRADED")
    expect(row.score_label).toBe("No aprobado")
    expect(row.passed).toBe(false)
  })

  it("refuses a professor not assigned to the edition with insufficient_privilege", async () => {
    const t = await buildTranscript("assess-denied", 0)
    const { error } = await t.outsiderProfessor.client.rpc("staff_enrollment_assessments", {
      p_enrollment: t.enrollmentId,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("staff_enrollment_activity", () => {
  it("derives MODULE_COMPLETED from the required blocks only, dated by the last required block", async () => {
    const t = await buildTranscript("activity", 0)

    const { data, error } = await t.admin.client.rpc("staff_enrollment_activity", {
      p_enrollment: t.enrollmentId,
    })
    expect(error).toBeNull()
    const rows = data!

    const moduleDone = rows.filter((r) => r.kind === "MODULE_COMPLETED")
    // Module 2 has a required block not done, so only Module 1 completes.
    expect(moduleDone).toHaveLength(1)
    expect(moduleDone[0]!.module_title).toBe("Módulo 1")
    expect(new Date(moduleDone[0]!.occurred_at).toISOString()).toBe(M1_BLOCK_B_AT)

    const blocks = rows.filter((r) => r.kind === "BLOCK_COMPLETED")
    expect(blocks).toHaveLength(2)
    expect(blocks.every((r) => r.module_title === "Módulo 1")).toBe(true)
    expect(blocks.map((r) => new Date(r.occurred_at).toISOString()).sort()).toEqual([
      M1_BLOCK_A_AT,
      M1_BLOCK_B_AT,
    ])
  })

  it("includes attempt submission and grading rows with the score label and pass flag", async () => {
    const t = await buildTranscript("activity-attempt", 0)

    const { data, error } = await t.admin.client.rpc("staff_enrollment_activity", {
      p_enrollment: t.enrollmentId,
    })
    expect(error).toBeNull()
    const rows = data!

    const submitted = rows.find((r) => r.kind === "ATTEMPT_SUBMITTED")
    expect(submitted?.item_title).toBe(t.assessmentTitle)
    expect(submitted?.occurred_at).toBeTruthy()

    const graded = rows.find((r) => r.kind === "ATTEMPT_GRADED")
    expect(graded?.item_title).toBe(t.assessmentTitle)
    expect(graded?.score_label).toBe("No aprobado")
    expect(graded?.passed).toBe(false)
  })

  it("orders the timeline newest first", async () => {
    const t = await buildTranscript("activity-order", 0)
    const { data } = await t.admin.client.rpc("staff_enrollment_activity", { p_enrollment: t.enrollmentId })
    const times = data!.map((r) => new Date(r.occurred_at).getTime())
    expect(times).toEqual([...times].sort((a, b) => b - a))
  })

  it("refuses another student reading someone else's enrollment", async () => {
    const t = await buildTranscript("activity-peer", 0)
    const peer = await member("tr-activity-peer", ORG_A, "STUDENT")
    const { error } = await peer.client.rpc("staff_enrollment_activity", { p_enrollment: t.enrollmentId })
    expect(error?.code).toBe("42501")
  })
})

describe("staff_enrollment_pending", () => {
  it("lists the uncompleted required block and the ungraded-to-pass assessment, but not optional blocks", async () => {
    const t = await buildTranscript("pending-fail", 0)

    const { data, error } = await t.admin.client.rpc("staff_enrollment_pending", { p_enrollment: t.enrollmentId })
    expect(error).toBeNull()
    const rows = data!

    const blocks = rows.filter((r) => r.kind === "BLOCK")
    expect(blocks).toHaveLength(1)
    expect(blocks[0]!.module_title).toBe("Módulo 2")
    expect(blocks[0]!.item_kind).toBe("RICH_TEXT")

    const assessments = rows.filter((r) => r.kind === "ASSESSMENT")
    expect(assessments).toHaveLength(1)
    expect(assessments[0]!.item_title).toBe(t.assessmentTitle)
    expect(assessments[0]!.item_kind).toBe("EXAM")
  })

  it("drops the assessment from pending once a passing graded attempt exists", async () => {
    const t = await buildTranscript("pending-pass", 1)

    const { data, error } = await t.admin.client.rpc("staff_enrollment_pending", { p_enrollment: t.enrollmentId })
    expect(error).toBeNull()
    expect(data!.filter((r) => r.kind === "ASSESSMENT")).toHaveLength(0)
    expect(data!.filter((r) => r.kind === "BLOCK")).toHaveLength(1)
  })

  it("refuses an anonymous caller on every transcript RPC", async () => {
    const t = await buildTranscript("anon", 0)
    const anon = anonClient()
    const results = await Promise.all([
      anon.rpc("staff_student_enrollments", { p_user: t.student.id }),
      anon.rpc("staff_enrollment_assessments", { p_enrollment: t.enrollmentId }),
      anon.rpc("staff_enrollment_activity", { p_enrollment: t.enrollmentId }),
      anon.rpc("staff_enrollment_pending", { p_enrollment: t.enrollmentId }),
    ])
    for (const r of results) {
      expect(r.error).not.toBeNull()
      expect(r.data).toBeFalsy()
    }
  })
})
