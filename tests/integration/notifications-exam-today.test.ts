import { afterAll, beforeAll, describe, expect, it } from "vitest"
import {
  assignOfferingProfessor,
  cleanupFixtures,
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  type CourseFixture,
} from "../helpers/course-fixtures"
import { createMemberFactory } from "../helpers/membership"
import type { TestUser } from "../helpers/make-user"
import { psql } from "../helpers/sql"
import {
  deleteOrg,
  insertAttempt,
  localToday,
  makeOrgInTimezone,
  nextDay,
  notificationsOf,
  ORG_A,
} from "../helpers/notification-fixtures"

/**
 * sweep_exam_today_notifications(p_now): an EXAM that opens on the org's local
 * calendar day gets one EXAM_TODAY per student, from 08:00 org-local time.
 * Clock is passed explicitly (p_now) so 07:59 and 08:00 are exact.
 */

const MVD = "America/Montevideo"
const MVD_OFFSET = "-03:00"
const TOKYO = "Asia/Tokyo"
const TOKYO_OFFSET = "+09:00"

const cleanup: string[] = []
const courseIds: string[] = []
const orgIds: string[] = []
const member = createMemberFactory(cleanup)
const examSweep = (pNow: string) => psql(`select sweep_exam_today_notifications('${pNow}'::timestamptz)`)
const localIso = (day: string, hhmm: string, offset: string) => new Date(`${day}T${hhmm}:00${offset}`).toISOString()

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
  for (const orgId of orgIds) await deleteOrg(orgId)
})

async function enrolled(course: CourseFixture, orgId: string, label: string): Promise<TestUser & { enrollmentId: string }> {
  const user = await member(label, orgId, "STUDENT")
  return { ...user, enrollmentId: await enrollStudent(course, orgId, user.id) }
}

describe("EXAM_TODAY in Montevideo (ORG_A)", () => {
  const today = localToday(MVD)
  const tomorrow = nextDay(today)
  let course: CourseFixture
  let student: TestUser & { enrollmentId: string }
  let attempted: TestUser & { enrollmentId: string }
  let examToday: string
  let examTomorrow: string
  let quizToday: string

  beforeAll(async () => {
    course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso examen",
      modules: [{ title: "Módulo", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    const prof = await member("exam-prof", ORG_A, "PROFESSOR")
    await assignOfferingProfessor(course.offeringId, prof.id)
    student = await enrolled(course, ORG_A, "exam-student")
    attempted = await enrolled(course, ORG_A, "exam-attempted")

    const window = (day: string) => ({
      availableFrom: localIso(day, "12:00", MVD_OFFSET),
      availableUntil: localIso(day, "23:00", MVD_OFFSET),
    })
    examToday = (
      await makeAssessmentFixture({
        offeringId: course.offeringId,
        organizationId: ORG_A,
        title: "Examen de hoy",
        kind: "EXAM",
        durationSeconds: 3600,
        ...window(today),
      })
    ).assessmentId
    examTomorrow = (
      await makeAssessmentFixture({
        offeringId: course.offeringId,
        organizationId: ORG_A,
        title: "Examen de mañana",
        kind: "EXAM",
        durationSeconds: 3600,
        ...window(tomorrow),
      })
    ).assessmentId
    quizToday = (
      await makeAssessmentFixture({
        offeringId: course.offeringId,
        organizationId: ORG_A,
        title: "Quiz de hoy",
        kind: "QUIZ",
        ...window(today),
      })
    ).assessmentId

    await insertAttempt({
      assessmentId: examToday,
      enrollmentId: attempted.enrollmentId,
      userId: attempted.id,
      organizationId: ORG_A,
      status: "IN_PROGRESS",
    })
  })

  const rowsFor = (user: TestUser, assessmentId: string) =>
    notificationsOf(user.id, { type: "EXAM_TODAY", entityId: assessmentId })

  it("sends nothing before 08:00 local", async () => {
    examSweep(`${today}T07:59:00${MVD_OFFSET}`)
    expect(await rowsFor(student, examToday)).toHaveLength(0)
  })

  it("from 08:00 local: one row per student; attempted, tomorrow and quiz are skipped", async () => {
    examSweep(`${today}T08:00:00${MVD_OFFSET}`)
    const rows = await rowsFor(student, examToday)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.payload).toMatchObject({ assessmentTitle: "Examen de hoy", enrollmentId: student.enrollmentId })
    // Postgres JSON formats timestamps as +00:00, so compare instants, not strings.
    expect(Date.parse((rows[0]!.payload as { startsAt: string }).startsAt)).toBe(
      Date.parse(localIso(today, "12:00", MVD_OFFSET))
    )

    expect(await rowsFor(attempted, examToday)).toHaveLength(0)
    expect(await rowsFor(student, examTomorrow)).toHaveLength(0)
    expect(await rowsFor(student, quizToday)).toHaveLength(0)
  })

  it("a later run the same day keeps the single row with the same id", async () => {
    const [first] = await rowsFor(student, examToday)
    examSweep(`${today}T09:30:00${MVD_OFFSET}`)
    examSweep(`${today}T10:00:00${MVD_OFFSET}`)
    const rows = await rowsFor(student, examToday)
    expect(rows.map((r) => r.id)).toEqual([first!.id])
  })
})

describe("EXAM_TODAY uses the organization's timezone (Asia/Tokyo)", () => {
  let tokyoOrg: string
  let tokyoStudent: TestUser & { enrollmentId: string }
  let tokyoExam: string
  let tokyoDay: string

  beforeAll(async () => {
    tokyoOrg = await makeOrgInTimezone(TOKYO)
    orgIds.push(tokyoOrg)
    const course = await makeCourseFixture({
      organizationId: tokyoOrg,
      title: "Curso Tokio",
      modules: [{ title: "Módulo", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    tokyoStudent = await enrolled(course, tokyoOrg, "exam-tokyo")

    tokyoDay = localToday(TOKYO)
    tokyoExam = (
      await makeAssessmentFixture({
        offeringId: course.offeringId,
        organizationId: tokyoOrg,
        title: "Examen Tokio",
        kind: "EXAM",
        durationSeconds: 3600,
        availableFrom: localIso(tokyoDay, "10:00", TOKYO_OFFSET),
        availableUntil: localIso(tokyoDay, "23:00", TOKYO_OFFSET),
      })
    ).assessmentId
  })

  it("is quiet at 07:59 in Tokyo, then notifies at 08:00 Tokyo time", async () => {
    examSweep(`${tokyoDay}T07:59:00${TOKYO_OFFSET}`)
    expect(await notificationsOf(tokyoStudent.id, { type: "EXAM_TODAY", entityId: tokyoExam })).toHaveLength(0)

    // 08:00 in Tokyo is still the previous evening in Montevideo: only the org's own zone can fire here.
    examSweep(`${tokyoDay}T08:00:00${TOKYO_OFFSET}`)
    const rows = await notificationsOf(tokyoStudent.id, { type: "EXAM_TODAY", entityId: tokyoExam })
    expect(rows).toHaveLength(1)
    expect(rows[0]!.organization_id).toBe(tokyoOrg)
  })
})
