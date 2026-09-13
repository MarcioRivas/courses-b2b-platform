import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { cleanupFixtures, makeCourseFixture } from "../helpers/course-fixtures"

/**
 * Free-course catalog + `self_enroll_free_course` from the student's side
 * (phase-04 step 6, D13/D29): idempotency, what the catalog may show, and the
 * refusals behind it.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })

})

async function freeCourse(title: string, organizationId = ORG_A) {
  const fixture = await makeCourseFixture({
    organizationId,
    title,
    accessType: "FREE",
    modules: [{ title: "Módulo libre", requiredBlocks: 1 }],
  })
  courseIds.push(fixture.courseId)
  return fixture
}

describe("self_enroll_free_course", () => {
  it("returns the same enrollment when called twice", async () => {
    const student = await member("free-idempotent", ORG_A, "STUDENT")
    const fixture = await freeCourse("Curso gratuito idempotente")

    const first = await student.client.rpc("self_enroll_free_course", { p_course: fixture.courseId })
    const second = await student.client.rpc("self_enroll_free_course", { p_course: fixture.courseId })

    expect(first.error).toBeNull()
    expect(second.data).toBe(first.data)

    const { count } = await supabaseAdmin
      .from("course_enrollments")
      .select("id", { count: "exact", head: true })
      .eq("course_id", fixture.courseId)
      .eq("user_id", student.id)
    expect(count).toBe(1)
  })

  it("seeds the denominator so the new enrollment reports progress immediately", async () => {
    const student = await member("free-denominator", ORG_A, "STUDENT")
    const fixture = await freeCourse("Curso gratuito denominador")

    const { data: enrollmentId } = await student.client.rpc("self_enroll_free_course", {
      p_course: fixture.courseId,
    })

    const { data } = await supabaseAdmin
      .from("course_enrollments")
      .select("total_blocks, progress_percent, source")
      .eq("id", enrollmentId!)
      .single()

    expect(data!.total_blocks).toBe(1)
    expect(Number(data!.progress_percent)).toBe(0)
    expect(data!.source).toBe("FREE_COURSE")
  })

  it("lets the student complete a block right after self-enrolling", async () => {
    const student = await member("free-complete", ORG_A, "STUDENT")
    const fixture = await freeCourse("Curso gratuito completable")

    const { data: enrollmentId } = await student.client.rpc("self_enroll_free_course", {
      p_course: fixture.courseId,
    })

    const { data, error } = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId!,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })

    expect(error).toBeNull()
    expect(Number(data![0]!.progress_percent)).toBe(100)
  })

  it("refuses a PRIVATE course", async () => {
    const student = await member("free-private", ORG_A, "STUDENT")
    const fixture = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso privado",
      accessType: "PRIVATE",
      modules: [{ title: "Módulo", requiredBlocks: 1 }],
    })
    courseIds.push(fixture.courseId)

    const { error } = await student.client.rpc("self_enroll_free_course", {
      p_course: fixture.courseId,
    })
    expect(error?.code).toBe("22023")
  })

  it("refuses a member of another organization", async () => {
    const outsider = await member("free-outsider", ORG_B, "STUDENT")
    const fixture = await freeCourse("Curso gratuito de otra org")

    const { error } = await outsider.client.rpc("self_enroll_free_course", {
      p_course: fixture.courseId,
    })
    expect(error?.code).toBe("42501")
  })
})

describe("free course catalog visibility", () => {
  it("shows a PUBLISHED FREE course of the caller's org and hides other tenants'", async () => {
    const student = await member("catalog-visible", ORG_A, "STUDENT")
    const mine = await freeCourse("Catálogo propio")
    const theirs = await freeCourse("Catálogo ajeno", ORG_B)

    const { data } = await student.client
      .from("courses")
      .select("id")
      .eq("access_type", "FREE")
      .eq("status", "PUBLISHED")

    const ids = (data ?? []).map((row) => row.id)
    expect(ids).toContain(mine.courseId)
    expect(ids).not.toContain(theirs.courseId)
  })

  it("hides a DRAFT free course from students", async () => {
    const student = await member("catalog-draft", ORG_A, "STUDENT")
    const fixture = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Catálogo borrador",
      accessType: "FREE",
      status: "DRAFT",
      modules: [{ title: "Módulo", requiredBlocks: 1 }],
    })
    courseIds.push(fixture.courseId)

    const { data } = await student.client.from("courses").select("id").eq("id", fixture.courseId)
    expect(data ?? []).toHaveLength(0)
  })
})
