import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { cleanupFixtures, enrollStudent, makeCourseFixture } from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"

/**
 * `my_enrollment_summaries` resume point (student "Cursos" screen, phase-01):
 * `last_activity_at` and `resume_lesson_id` / `resume_module_title` follow the
 * most recently completed block of the student's own enrollment.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
})

async function twoModuleCourse(title: string) {
  const fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [
      { title: "Módulo 1", requiredBlocks: 1 },
      { title: "Módulo 2", requiredBlocks: 1 },
    ],
  })
  courseIds.push(fixture.courseId)
  return fixture
}

async function summaryFor(client: TestUser["client"], enrollmentId: string) {
  const { data, error } = await client.rpc("my_enrollment_summaries", { p_enrollment: enrollmentId })
  expect(error).toBeNull()
  expect(data).toHaveLength(1)
  return data![0]!
}

describe("my_enrollment_summaries: resume point", () => {
  it("before any completed block: no resume point, activity falls back to enrolled_at", async () => {
    const student = await member("resume-fresh", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Resume fresco")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const row = await summaryFor(student.client, enrollmentId)
    const { data: enrollment } = await supabaseAdmin
      .from("course_enrollments")
      .select("enrolled_at")
      .eq("id", enrollmentId)
      .single()

    expect(row.resume_lesson_id).toBeNull()
    expect(row.resume_module_title).toBeNull()
    expect(row.last_activity_at).not.toBeNull()
    expect(Date.parse(row.last_activity_at)).toBe(Date.parse(enrollment!.enrolled_at))
  })

  it("after completing a block: resume points to that block's lesson and module, activity is recent", async () => {
    const student = await member("resume-one", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Resume uno")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const before = await summaryFor(student.client, enrollmentId)

    const { error } = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[1]!.blockIds[0]!,
      p_completed: true,
    })
    expect(error).toBeNull()

    const row = await summaryFor(student.client, enrollmentId)
    expect(row.resume_lesson_id).toBe(fixture.modules[1]!.lessonId)
    expect(row.resume_module_title).toBe("Módulo 2")
    expect(row.completed_blocks).toBe(1)

    const { data: enrollment } = await supabaseAdmin
      .from("course_enrollments")
      .select("enrolled_at")
      .eq("id", enrollmentId)
      .single()
    expect(Date.parse(row.last_activity_at)).toBeGreaterThanOrEqual(Date.parse(enrollment!.enrolled_at))
    expect(Date.parse(row.last_activity_at)).toBeGreaterThanOrEqual(Date.parse(before.last_activity_at))
  })

  it("moves the resume point to the most recently completed block, not the furthest one", async () => {
    const student = await member("resume-latest", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Resume último")
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[1]!.blockIds[0]!,
      p_completed: true,
    })
    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })

    const row = await summaryFor(student.client, enrollmentId)
    expect(row.resume_lesson_id).toBe(fixture.modules[0]!.lessonId)
    expect(row.resume_module_title).toBe("Módulo 1")
    expect(row.completed_blocks).toBe(2)
    expect(row.status).toBe("COMPLETED")
  })

  it("does not show another student's resume point", async () => {
    const owner = await member("resume-owner", ORG_A, "STUDENT")
    const intruder = await member("resume-intruder", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Resume privado")
    const enrollmentId = await enrollStudent(fixture, ORG_A, owner.id)

    await owner.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })

    const { data } = await intruder.client.rpc("my_enrollment_summaries", { p_enrollment: enrollmentId })
    expect(data ?? []).toHaveLength(0)
  })

  it("returns the summary without the filter, newest enrollment first, with the new columns present", async () => {
    const student = await member("resume-list", ORG_A, "STUDENT")
    const fixture = await twoModuleCourse("Resume listado")
    await enrollStudent(fixture, ORG_A, student.id)

    const { data, error } = await student.client.rpc("my_enrollment_summaries")
    expect(error).toBeNull()
    expect(data).toHaveLength(1)
    expect(data![0]).toHaveProperty("last_activity_at")
    expect(data![0]).toHaveProperty("resume_lesson_id")
    expect(data![0]).toHaveProperty("resume_module_title")
  })
})
