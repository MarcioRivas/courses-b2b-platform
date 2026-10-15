import { afterAll, describe, expect, it } from "vitest"
import type { TestUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { submitOpenAttempt } from "../helpers/attempt-submission"
import {
  assignOfferingProfessor,
  cleanupFixtures,
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  type CourseFixture,
} from "../helpers/course-fixtures"
import { deleteGroups, makeTwoEditionCourse } from "../helpers/edition-fixtures"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { ORG_A, at, insertAttempt, makeTask, notificationsOf } from "../helpers/notification-fixtures"

/**
 * Event notifications written by notify_on_attempt_change: ASSESSMENT_GRADED
 * (manual grades only), LATE_SUBMISSIONS and ATTEMPT_NEEDS_GRADING (grouped per
 * assessment, one row per edition professor, count kept live).
 */

const cleanup: string[] = []
const courseIds: string[] = []
const groupIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
  await deleteGroups(groupIds)
})

interface Student {
  user: TestUser
  enrollmentId: string
}

async function edition(label: string): Promise<CourseFixture> {
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso ntf ${label}`,
    modules: [{ title: "Módulo", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)
  return course
}

async function professorOf(offeringId: string, label: string): Promise<TestUser> {
  const prof = await member(`${label}-prof`, ORG_A, "PROFESSOR")
  await assignOfferingProfessor(offeringId, prof.id)
  return prof
}

async function students(course: CourseFixture, label: string, count: number): Promise<Student[]> {
  const out: Student[] = []
  for (let i = 0; i < count; i++) {
    const user = await member(`${label}-st${i}`, ORG_A, "STUDENT")
    out.push({ user, enrollmentId: await enrollStudent(course, ORG_A, user.id) })
  }
  return out
}

async function quiz(course: CourseFixture, label: string, questions: { multipleChoice: number; openEnded: number }) {
  return makeAssessmentFixture({
    offeringId: course.offeringId,
    organizationId: ORG_A,
    title: `Quiz ntf ${label}`,
    kind: "QUIZ",
    ...questions,
  })
}

async function statusOf(attemptId: string): Promise<string | null> {
  const { data } = await supabaseAdmin.from("assessment_attempts").select("status").eq("id", attemptId).single()
  return data?.status ?? null
}

describe("ASSESSMENT_GRADED (manual grading of a TASK)", () => {
  it("notifies the student once, and a regrade re-surfaces the same row as unread", async () => {
    const course = await edition("tarea-nota")
    const prof = await professorOf(course.offeringId, "tarea-nota")
    const [st] = await students(course, "tarea-nota", 1)
    // Deadline already passed (DB clock): grading is only allowed after it.
    const assessmentId = await makeTask(course.offeringId, ORG_A, "Tarea nota", at(-1))
    const attemptId = await insertAttempt({
      assessmentId,
      enrollmentId: st!.enrollmentId,
      userId: st!.user.id,
      organizationId: ORG_A,
      status: "SUBMITTED",
    })

    const first = await prof.client.rpc("grade_task_submission", { p_attempt: attemptId, p_score: 70, p_feedback: "Bien" })
    expect(first.error).toBeNull()

    const rows = await notificationsOf(st!.user.id, { type: "ASSESSMENT_GRADED" })
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ entity_id: attemptId, read_at: null, offering_id: course.offeringId })
    expect(rows[0]!.payload).toMatchObject({ attemptId, assessmentId, kind: "TASK" })
    expect(await notificationsOf(prof.id, { type: "ASSESSMENT_GRADED" })).toHaveLength(0)

    await st!.user.client.rpc("mark_notification_read", { p_notification: rows[0]!.id })
    expect(await unreadOf(st!.user)).toBe(0)

    const regrade = await prof.client.rpc("grade_task_submission", { p_attempt: attemptId, p_score: 90 })
    expect(regrade.error).toBeNull()

    const after = await notificationsOf(st!.user.id, { type: "ASSESSMENT_GRADED" })
    expect(after.map((r) => r.id)).toEqual([rows[0]!.id])
    expect(after[0]!.read_at).toBeNull()
    expect(Date.parse(after[0]!.updated_at)).toBeGreaterThan(Date.parse(rows[0]!.updated_at))
    expect(await unreadOf(st!.user)).toBe(1)
  })

  it("an auto-graded multiple-choice quiz notifies nobody", async () => {
    const course = await edition("quiz-auto")
    const prof = await professorOf(course.offeringId, "quiz-auto")
    const [st] = await students(course, "quiz-auto", 1)
    const fixture = await quiz(course, "auto", { multipleChoice: 2, openEnded: 0 })

    const { attemptId } = await submitOpenAttempt(st!.user, st!.enrollmentId, fixture.assessmentId)
    expect(await statusOf(attemptId)).toBe("GRADED")

    expect(await notificationsOf(st!.user.id, { entityId: attemptId })).toHaveLength(0)
    expect(await notificationsOf(prof.id, { entityId: fixture.assessmentId })).toHaveLength(0)
  })

  it("partial open-answer grading notifies nobody until the last answer is graded", async () => {
    const course = await edition("quiz-parcial")
    const prof = await professorOf(course.offeringId, "quiz-parcial")
    const [st] = await students(course, "quiz-parcial", 1)
    const fixture = await quiz(course, "parcial", { multipleChoice: 0, openEnded: 2 })

    const { attemptId, questions } = await submitOpenAttempt(st!.user, st!.enrollmentId, fixture.assessmentId)
    expect(await statusOf(attemptId)).toBe("SUBMITTED")
    const pending = await notificationsOf(prof.id, { type: "ATTEMPT_NEEDS_GRADING" })
    expect(pending).toHaveLength(1)
    expect(pending[0]!.payload).toMatchObject({ count: 1, assessmentId: fixture.assessmentId })

    const [q1, q2] = questions.filter((q) => q.type === "OPEN_ENDED").map((q) => q.id)
    const first = await prof.client.rpc("grade_open_answer", {
      p_attempt: attemptId,
      p_attempt_question: q1!,
      p_points: 1,
      p_feedback: "Ok",
    })
    expect(first.error).toBeNull()
    expect(await statusOf(attemptId)).toBe("SUBMITTED")
    expect(await notificationsOf(st!.user.id, { type: "ASSESSMENT_GRADED" })).toHaveLength(0)

    const last = await prof.client.rpc("grade_open_answer", { p_attempt: attemptId, p_attempt_question: q2!, p_points: 0 })
    expect(last.error).toBeNull()
    expect(await statusOf(attemptId)).toBe("GRADED")
    const graded = await notificationsOf(st!.user.id, { type: "ASSESSMENT_GRADED" })
    expect(graded).toHaveLength(1)
    expect(graded[0]!.entity_id).toBe(attemptId)
  })
})

describe("LATE_SUBMISSIONS (grouped per assessment)", () => {
  it("two late submissions give each edition professor one row counting 2; other professors get none", async () => {
    const two = await makeTwoEditionCourse(ORG_A, "Curso tarde")
    courseIds.push(two.courseId)
    groupIds.push(two.groupId)
    const course = two.a.fixture
    const profA1 = await professorOf(course.offeringId, "tarde-a1")
    const profA2 = await professorOf(course.offeringId, "tarde-a2")
    // Professor of the sibling edition (same course, other offering) and an unassigned professor.
    const profSibling = await professorOf(two.b.offeringId, "tarde-hermana")
    const profUnassigned = await member("tarde-sin-edicion", ORG_A, "PROFESSOR")

    const assessmentId = await makeTask(course.offeringId, ORG_A, "Tarea tarde", at(-1), true)
    const [s1, s2] = await students(course, "tarde", 2)
    const submit = (s: Student) =>
      insertAttempt({
        assessmentId,
        enrollmentId: s.enrollmentId,
        userId: s.user.id,
        organizationId: ORG_A,
        status: "SUBMITTED",
        submittedLate: true,
      })

    await submit(s1!)
    const first = await notificationsOf(profA1.id, { type: "LATE_SUBMISSIONS" })
    expect(first).toHaveLength(1)
    expect(first[0]!.payload).toMatchObject({ count: 1, assessmentId })

    await submit(s2!)
    for (const prof of [profA1, profA2]) {
      const rows = await notificationsOf(prof.id, { type: "LATE_SUBMISSIONS" })
      expect(rows).toHaveLength(1)
      expect(rows[0]!.payload).toMatchObject({ count: 2, assessmentId })
    }
    // profA1 kept the row from the first submission: grouped, not duplicated.
    expect((await notificationsOf(profA1.id, { type: "LATE_SUBMISSIONS" }))[0]!.id).toBe(first[0]!.id)

    expect(await notificationsOf(profSibling.id, { type: "LATE_SUBMISSIONS" })).toHaveLength(0)
    expect(await notificationsOf(profUnassigned.id, { type: "LATE_SUBMISSIONS" })).toHaveLength(0)
    expect(await notificationsOf(s1!.user.id, { type: "LATE_SUBMISSIONS" })).toHaveLength(0)
  })
})

describe("ATTEMPT_NEEDS_GRADING (open-ended quiz, several students)", () => {
  it("SUBMITTED and AUTO_SUBMITTED attempts share one grouped row whose count is live", async () => {
    const course = await edition("abierto")
    const prof = await professorOf(course.offeringId, "abierto")
    const [s1, s2, s3] = await students(course, "abierto", 3)
    const fixture = await quiz(course, "abierto", { multipleChoice: 0, openEnded: 1 })

    await submitOpenAttempt(s1!.user, s1!.enrollmentId, fixture.assessmentId)
    const afterOne = await notificationsOf(prof.id, { type: "ATTEMPT_NEEDS_GRADING" })
    expect(afterOne).toHaveLength(1)
    expect(afterOne[0]!.payload).toMatchObject({ count: 1 })

    await submitOpenAttempt(s2!.user, s2!.enrollmentId, fixture.assessmentId)
    const afterTwo = await notificationsOf(prof.id, { type: "ATTEMPT_NEEDS_GRADING" })
    expect(afterTwo.map((r) => r.id)).toEqual(afterOne.map((r) => r.id))
    expect(afterTwo[0]!.payload).toMatchObject({ count: 2 })

    // Third student never submits: the deadline sweep finalizes the attempt as AUTO_SUBMITTED.
    const { data: attemptId, error } = await s3!.user.client.rpc("start_attempt", {
      p_enrollment: s3!.enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    if (error || !attemptId) throw error ?? new Error("attempt not started")
    await supabaseAdmin.from("assessment_attempts").update({ effective_end_at: at(-1) }).eq("id", attemptId)
    const finalized = await supabaseAdmin.rpc("finalize_attempt", { p_attempt: attemptId, p_reason: "AUTO" })
    expect(finalized.error).toBeNull()
    expect(await statusOf(attemptId)).toBe("AUTO_SUBMITTED")

    const rows = await notificationsOf(prof.id, { type: "ATTEMPT_NEEDS_GRADING" })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe(afterOne[0]!.id)
    expect(rows[0]!.payload).toMatchObject({ count: 3, assessmentId: fixture.assessmentId })
    expect(await notificationsOf(s1!.user.id, { type: "ATTEMPT_NEEDS_GRADING" })).toHaveLength(0)
  })
})

async function unreadOf(user: TestUser): Promise<number> {
  const { data, error } = await user.client.rpc("my_unread_notification_count")
  if (error) throw error
  return data ?? -1
}
