import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { submitOpenAttempt } from "../helpers/attempt-submission"
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
import { supabaseAdmin } from "../helpers/supabase-admin"
import { ORG_A, at, insertAttempt, makeTask, notificationsOf } from "../helpers/notification-fixtures"

/**
 * sweep_time_based_notifications(): MODULE_OPENED (1-day lookback),
 * MODULE_CLOSING_SOON (48h, unfinished), ASSESSMENT_DUE_SOON (48h, unsubmitted),
 * TASK_READY_TO_GRADE (deadline in the last day, >= 1 submission).
 * Called straight through psql; the cron schedule itself is asserted separately.
 */

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)
const sweep = () => psql("select sweep_time_based_notifications()")

interface Student {
  user: TestUser
  enrollmentId: string
}

async function studentIn(course: CourseFixture, label: string): Promise<Student> {
  const user = await member(label, ORG_A, "STUDENT")
  return { user, enrollmentId: await enrollStudent(course, ORG_A, user.id) }
}

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
})

describe("cron sweep: time-based notifications", () => {
  let course: CourseFixture
  let prof: TestUser
  let open: Student
  let done: Student
  let cancelled: Student
  const ids = { quizDue: "", quizSubmitted: "", quizLater: "", taskReady: "", taskEmpty: "", taskOld: "" }

  beforeAll(async () => {
    course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso sweep",
      modules: [
        { title: "Módulo abierto", requiredBlocks: 1 },
        { title: "Módulo por cerrar", requiredBlocks: 1 },
        { title: "Módulo futuro", requiredBlocks: 1 },
      ],
    })
    courseIds.push(course.courseId)
    prof = await member("sweep-prof", ORG_A, "PROFESSOR")
    await assignOfferingProfessor(course.offeringId, prof.id)

    const [mOpen, mClosing, mFuture] = course.modules
    const { error: scheduleError } = await supabaseAdmin.from("offering_module_schedules").insert([
      { offering_id: course.offeringId, module_id: mOpen!.id, available_from: at(-2), available_until: at(120) },
      // Opened 3 days ago (outside the lookback), closes in 10h.
      { offering_id: course.offeringId, module_id: mClosing!.id, available_from: at(-72), available_until: at(10) },
      { offering_id: course.offeringId, module_id: mFuture!.id, available_from: at(24), available_until: at(72) },
    ])
    if (scheduleError) throw scheduleError

    open = await studentIn(course, "sweep-open")
    done = await studentIn(course, "sweep-done")
    cancelled = await studentIn(course, "sweep-cancelled")
    await supabaseAdmin.from("course_enrollments").update({ status: "CANCELLED" }).eq("id", cancelled.enrollmentId)

    // `done` finished the closing module, so it must not be warned about it.
    const { error: progressError } = await supabaseAdmin
      .from("content_progress")
      .insert({ enrollment_id: done.enrollmentId, content_block_id: mClosing!.blockIds[0]! })
    if (progressError) throw progressError

    const quiz = (title: string, availableUntil: string) =>
      makeAssessmentFixture({
        offeringId: course.offeringId,
        organizationId: ORG_A,
        title,
        kind: "QUIZ",
        multipleChoice: 1,
        availableFrom: at(-1),
        availableUntil,
      })
    ids.quizDue = (await quiz("Quiz vence pronto", at(24))).assessmentId
    ids.quizSubmitted = (await quiz("Quiz ya entregado", at(24))).assessmentId
    ids.quizLater = (await quiz("Quiz vence tarde", at(72))).assessmentId
    await submitOpenAttempt(open.user, open.enrollmentId, ids.quizSubmitted)

    ids.taskReady = await makeTask(course.offeringId, ORG_A, "Tarea lista", at(-2))
    await insertAttempt({
      assessmentId: ids.taskReady,
      enrollmentId: open.enrollmentId,
      userId: open.user.id,
      organizationId: ORG_A,
      status: "SUBMITTED",
    })
    ids.taskEmpty = await makeTask(course.offeringId, ORG_A, "Tarea sin entregas", at(-2))
    ids.taskOld = await makeTask(course.offeringId, ORG_A, "Tarea de hace dias", at(-30))
    await insertAttempt({
      assessmentId: ids.taskOld,
      enrollmentId: done.enrollmentId,
      userId: done.user.id,
      organizationId: ORG_A,
      status: "SUBMITTED",
    })

    sweep()
  })

  it("MODULE_OPENED: active students, module opened within the last day only", async () => {
    const [mOpen, mClosing, mFuture] = course.modules.map((m) => m.id)
    const openRows = await notificationsOf(open.user.id, { type: "MODULE_OPENED" })
    expect(openRows.map((r) => r.entity_id)).toEqual([mOpen])
    expect(openRows[0]!.payload).toMatchObject({ moduleTitle: "Módulo abierto", enrollmentId: open.enrollmentId })
    expect(openRows[0]!.offering_id).toBe(course.offeringId)

    expect((await notificationsOf(done.user.id, { type: "MODULE_OPENED" })).map((r) => r.entity_id)).toEqual([mOpen])
    // Opened 3 days ago: outside the 1-day lookback. Not yet open: nothing.
    expect(await notificationsOf(open.user.id, { type: "MODULE_OPENED", entityId: mClosing })).toHaveLength(0)
    expect(await notificationsOf(open.user.id, { type: "MODULE_OPENED", entityId: mFuture })).toHaveLength(0)
  })

  it("MODULE_CLOSING_SOON: unfinished modules closing within 48h; completed ones excluded", async () => {
    const [, mClosing] = course.modules.map((m) => m.id)
    const warned = await notificationsOf(open.user.id, { type: "MODULE_CLOSING_SOON" })
    expect(warned.map((r) => r.entity_id)).toEqual([mClosing])
    expect(warned[0]!.payload).toMatchObject({ moduleTitle: "Módulo por cerrar", availableUntil: expect.any(String) })

    expect(await notificationsOf(done.user.id, { type: "MODULE_CLOSING_SOON" })).toHaveLength(0)
    expect(await notificationsOf(open.user.id, { type: "MODULE_CLOSING_SOON", entityId: course.modules[0]!.id })).toHaveLength(0)
  })

  it("ASSESSMENT_DUE_SOON: due within 48h and not yet handed in", async () => {
    const due = (userId: string) => notificationsOf(userId, { type: "ASSESSMENT_DUE_SOON" })
    expect((await due(open.user.id)).map((r) => r.entity_id)).toEqual([ids.quizDue])
    expect((await due(done.user.id)).map((r) => r.entity_id).sort()).toEqual([ids.quizDue, ids.quizSubmitted].sort())
    expect((await due(open.user.id))[0]!.payload).toMatchObject({ assessmentTitle: "Quiz vence pronto", enrollmentId: open.enrollmentId })
    expect(await due(open.user.id)).not.toContainEqual(expect.objectContaining({ entity_id: ids.quizLater }))
  })

  it("a cancelled enrollment gets no notifications of any type", async () => {
    const rows = await notificationsOf(cancelled.user.id)
    expect(rows).toHaveLength(0)
  })

  it("TASK_READY_TO_GRADE: one row for the edition professor when a task closed with submissions", async () => {
    const ready = await notificationsOf(prof.id, { type: "TASK_READY_TO_GRADE", entityId: ids.taskReady })
    expect(ready).toHaveLength(1)
    expect(ready[0]!.payload).toMatchObject({ count: 1, assessmentTitle: "Tarea lista", offeringId: course.offeringId })

    expect(await notificationsOf(prof.id, { type: "TASK_READY_TO_GRADE", entityId: ids.taskEmpty })).toHaveLength(0)
    expect(await notificationsOf(prof.id, { type: "TASK_READY_TO_GRADE", entityId: ids.taskOld })).toHaveLength(0)
    expect(await notificationsOf(open.user.id, { type: "TASK_READY_TO_GRADE" })).toHaveLength(0)
  })

  it("rerunning the sweep changes nothing: same rows, same ids, same timestamps", async () => {
    const users = [open.user.id, done.user.id, cancelled.user.id, prof.id]
    const before = (await Promise.all(users.map((u) => notificationsOf(u)))).flat()
    expect(before.length).toBeGreaterThan(0)

    sweep()
    sweep()

    const after = (await Promise.all(users.map((u) => notificationsOf(u)))).flat()
    expect(after.map((r) => [r.id, r.updated_at]).sort()).toEqual(before.map((r) => [r.id, r.updated_at]).sort())
  })
})

describe("cron schedules", () => {
  it("both sweeps are registered with pg_cron at their intended cadence", async () => {
    const count = psql(
      "select count(*) from cron.job where (jobname = 'notification-sweep' and schedule = '*/10 * * * *') or (jobname = 'notification-exam-today' and schedule = '0 * * * *')"
    )
    expect(count).toBe("2")
  })
})
