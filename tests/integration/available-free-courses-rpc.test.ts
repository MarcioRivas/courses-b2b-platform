import { afterAll, describe, expect, it } from "vitest"
import { createClient } from "@supabase/supabase-js"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin, SUPABASE_TEST_ANON_KEY, SUPABASE_TEST_URL } from "../helpers/supabase-admin"
import { cleanupFixtures, makeCourseFixture } from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"

/**
 * `list_available_free_courses` (student "Cursos" screen, phase-01): what the
 * catalog may list, for whom, and the module count the card shows. Scoped by
 * the caller's organization and by auth.uid(), never by client-trusted input.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
})

async function freeCourse(
  title: string,
  options: { organizationId?: string; modules?: number; offeringStatus?: "ACTIVE" | "CANCELLED"; offeringEndsAt?: string | null; status?: "DRAFT" | "PUBLISHED" } = {}
) {
  const modules = Array.from({ length: options.modules ?? 1 }, (_, i) => ({
    title: `Módulo ${i + 1}`,
    requiredBlocks: 1,
  }))
  const fixture = await makeCourseFixture({
    organizationId: options.organizationId ?? ORG_A,
    title,
    accessType: "FREE",
    status: options.status ?? "PUBLISHED",
    offeringStatus: options.offeringStatus,
    offeringEndsAt: options.offeringEndsAt,
    modules,
  })
  courseIds.push(fixture.courseId)
  return fixture
}

async function listFor(client: TestUser["client"], organizationId: string) {
  const { data, error } = await client.rpc("list_available_free_courses", { p_organization: organizationId })
  expect(error).toBeNull()
  return data ?? []
}

const ids = (rows: { course_id: string }[]) => rows.map((row) => row.course_id)

describe("list_available_free_courses: organization scope", () => {
  it("returns nothing when a student of ORG_A asks for ORG_B", async () => {
    const student = await member("avail-cross-org", ORG_A, "STUDENT")
    await freeCourse("Disponible de otra org", { organizationId: ORG_B })

    const rows = await listFor(student.client, ORG_B)
    expect(rows).toEqual([])
  })

  it("never lists an ORG_B free course to an ORG_A student", async () => {
    const student = await member("avail-no-leak", ORG_A, "STUDENT")
    const mine = await freeCourse("Disponible propia de A")
    const theirs = await freeCourse("Disponible ajena de B", { organizationId: ORG_B })

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).toContain(mine.courseId)
    expect(ids(rows)).not.toContain(theirs.courseId)
  })

  it("returns nothing for an organization the caller does not belong to, even if the course is free", async () => {
    const outsider = await member("avail-outsider", ORG_B, "STUDENT")
    const theirs = await freeCourse("Disponible solo de A")

    const rows = await listFor(outsider.client, ORG_A)
    expect(ids(rows)).not.toContain(theirs.courseId)
  })
})

describe("list_available_free_courses: what is offered", () => {
  it("lists a PUBLISHED FREE course with its module count and description", async () => {
    const student = await member("avail-fields", ORG_A, "STUDENT")
    const fixture = await freeCourse("Disponible con tres módulos", { modules: 3 })

    const rows = await listFor(student.client, ORG_A)
    const row = rows.find((r) => r.course_id === fixture.courseId)
    expect(row).toBeDefined()
    expect(row!.title).toBe("Disponible con tres módulos")
    expect(row!.module_count).toBe(3)
  })

  it("excludes a course the student is already enrolled in (ACTIVE)", async () => {
    const student = await member("avail-enrolled", ORG_A, "STUDENT")
    const fixture = await freeCourse("Inscripto no disponible")

    const { error: enrollError } = await student.client.rpc("self_enroll_free_course", {
      p_course: fixture.courseId,
    })
    expect(enrollError).toBeNull()

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).not.toContain(fixture.courseId)
  })

  it("excludes a course the student has COMPLETED", async () => {
    const student = await member("avail-completed", ORG_A, "STUDENT")
    const fixture = await freeCourse("Completado no disponible")

    const { data: enrollmentId } = await student.client.rpc("self_enroll_free_course", {
      p_course: fixture.courseId,
    })
    await supabaseAdmin.from("course_enrollments").update({ status: "COMPLETED" }).eq("id", enrollmentId!)

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).not.toContain(fixture.courseId)
  })

  it("lists the course again after the student's enrollment is CANCELLED", async () => {
    const student = await member("avail-cancelled", ORG_A, "STUDENT")
    const fixture = await freeCourse("Cancelado vuelve a disponible")

    const { data: enrollmentId } = await student.client.rpc("self_enroll_free_course", {
      p_course: fixture.courseId,
    })
    expect(ids(await listFor(student.client, ORG_A))).not.toContain(fixture.courseId)

    await supabaseAdmin.from("course_enrollments").update({ status: "CANCELLED" }).eq("id", enrollmentId!)

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).toContain(fixture.courseId)
  })

  it("excludes a FREE course whose only edition is CANCELLED", async () => {
    const student = await member("avail-cancelled-offering", ORG_A, "STUDENT")
    const fixture = await freeCourse("Edición cancelada", { offeringStatus: "CANCELLED" })

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).not.toContain(fixture.courseId)
  })

  it("excludes a FREE course that has no edition at all", async () => {
    const student = await member("avail-no-offering", ORG_A, "STUDENT")
    const fixture = await freeCourse("Sin edición")
    const { error } = await supabaseAdmin.from("course_offerings").delete().eq("id", fixture.offeringId)
    expect(error).toBeNull()

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).not.toContain(fixture.courseId)
  })

  it("excludes a FREE course whose edition has already ended", async () => {
    const student = await member("avail-ended", ORG_A, "STUDENT")
    const fixture = await freeCourse("Edición terminada", {
      offeringEndsAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
    })

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).not.toContain(fixture.courseId)
  })

  it("keeps a course whose edition ends in the future", async () => {
    const student = await member("avail-ends-later", ORG_A, "STUDENT")
    const fixture = await freeCourse("Edición que termina después", {
      offeringEndsAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
    })

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).toContain(fixture.courseId)
  })

  it("excludes a DRAFT free course", async () => {
    const student = await member("avail-draft", ORG_A, "STUDENT")
    const fixture = await freeCourse("Borrador no disponible", { status: "DRAFT" })

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).not.toContain(fixture.courseId)
  })

  it("excludes a PRIVATE course even when it has an open edition", async () => {
    const student = await member("avail-private", ORG_A, "STUDENT")
    const fixture = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Privado no disponible",
      accessType: "PRIVATE",
      modules: [{ title: "Módulo", requiredBlocks: 1 }],
    })
    courseIds.push(fixture.courseId)

    const rows = await listFor(student.client, ORG_A)
    expect(ids(rows)).not.toContain(fixture.courseId)
  })
})

describe("list_available_free_courses: access", () => {
  it("refuses anonymous callers", async () => {
    const anon = createClient(SUPABASE_TEST_URL, SUPABASE_TEST_ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })
    const { data, error } = await anon.rpc("list_available_free_courses", { p_organization: ORG_A })
    expect(error?.code).toBe("42501")
    expect(data).toBeNull()
  })
})
