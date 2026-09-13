import { afterAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"

/**
 * Phase 3 course/content RLS: course visibility (courses_select), the
 * `can_edit_course` authority behind modules/lessons writes, the
 * `assert_active_member_of_org` trigger on `course_professors`, and the D24
 * no-client-write guarantee on `course_enrollments`.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const createdCourseIds: string[] = []

afterAll(async () => {
  if (createdCourseIds.length > 0) {
    await supabaseAdmin.from("courses").delete().in("id", createdCourseIds)
  }
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

const member = createMemberFactory(cleanup)

interface MakeCourseOptions {
  status?: "DRAFT" | "PUBLISHED" | "ARCHIVED"
  accessType?: "FREE" | "PRIVATE"
  title?: string
}

async function makeCourse(organizationId: string, options: MakeCourseOptions = {}): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .insert({
      organization_id: organizationId,
      title: options.title ?? "Curso de prueba",
      access_type: options.accessType ?? "PRIVATE",
      status: options.status ?? "DRAFT",
    })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("course not created")
  createdCourseIds.push(data.id)
  return data.id
}

describe("courses RLS: student visibility", () => {
  it("a student cannot read a DRAFT course", async () => {
    const courseId = await makeCourse(ORG_A, { status: "DRAFT" })
    const student = await member("rls-student-draft", ORG_A, "STUDENT")

    const { data } = await student.client.from("courses").select("id").eq("id", courseId).maybeSingle()
    expect(data).toBeNull()
  })

  it("a student reads a PUBLISHED FREE course of their own org", async () => {
    const courseId = await makeCourse(ORG_A, { status: "PUBLISHED", accessType: "FREE" })
    const student = await member("rls-student-free", ORG_A, "STUDENT")

    const { data } = await student.client.from("courses").select("id").eq("id", courseId).maybeSingle()
    expect(data?.id).toBe(courseId)
  })
})

describe("courses RLS: cross-org isolation", () => {
  it("an org B admin cannot read an org A course", async () => {
    const courseId = await makeCourse(ORG_A, { status: "PUBLISHED", accessType: "FREE" })
    const adminB = await member("rls-adminb-crossorg", ORG_B, "ADMIN")

    const { data } = await adminB.client.from("courses").select("id").eq("id", courseId).maybeSingle()
    expect(data).toBeNull()
  })
})

describe("can_edit_course: professor scope", () => {
  it("a professor of course A cannot edit course B (insert a module)", async () => {
    const courseA = await makeCourse(ORG_A, { title: "Curso A" })
    const courseB = await makeCourse(ORG_A, { title: "Curso B" })
    const professor = await member("rls-prof-scope", ORG_A, "PROFESSOR")

    const { error: assignError } = await supabaseAdmin
      .from("course_professors")
      .insert({ course_id: courseA, user_id: professor.id })
    expect(assignError).toBeNull()

    const { data, error } = await professor.client
      .from("modules")
      .insert({ course_id: courseB, title: "Módulo intruso", position: 1 })
      .select("id")

    // A failed WITH CHECK on INSERT raises rather than silently filtering.
    expect(error).not.toBeNull()
    expect(data).toBeNull()
  })

  it("the same professor can create a module on their own assigned course", async () => {
    const courseA = await makeCourse(ORG_A, { title: "Curso asignado" })
    const professor = await member("rls-prof-ok", ORG_A, "PROFESSOR")
    await supabaseAdmin.from("course_professors").insert({ course_id: courseA, user_id: professor.id })

    const { data, error } = await professor.client
      .from("modules")
      .insert({ course_id: courseA, title: "Módulo propio", position: 1 })
      .select("id")
      .single()

    expect(error).toBeNull()
    expect(data?.id).toBeTruthy()
  })
})

describe("course_professors insert trigger (assert_active_member_of_org)", () => {
  it("rejects assigning a STUDENT as professor", async () => {
    const courseId = await makeCourse(ORG_A)
    const student = await member("rls-cp-student", ORG_A, "STUDENT")

    const { error } = await supabaseAdmin
      .from("course_professors")
      .insert({ course_id: courseId, user_id: student.id })

    expect(error?.code).toBe("P0001")
    expect(error?.message).toContain("does not have an ACTIVE")
  })

  it("rejects assigning a professor from a different org", async () => {
    const courseId = await makeCourse(ORG_A)
    const professorB = await member("rls-cp-foreign", ORG_B, "PROFESSOR")

    const { error } = await supabaseAdmin
      .from("course_professors")
      .insert({ course_id: courseId, user_id: professorB.id })

    expect(error?.code).toBe("P0001")
    expect(error?.message).toContain("does not have an ACTIVE")
  })
})

describe("course_enrollments: no client write succeeds (D24)", () => {
  it("an org admin cannot insert an enrollment directly", async () => {
    const courseId = await makeCourse(ORG_A, { status: "PUBLISHED", accessType: "FREE" })
    const admin = await member("rls-enroll-admin", ORG_A, "ADMIN")
    const student = await member("rls-enroll-student", ORG_A, "STUDENT")

    const { data: offering } = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: courseId, organization_id: ORG_A, kind: "OPEN", name: "Oferta abierta" })
      .select("id")
      .single()

    const { error } = await admin.client.from("course_enrollments").insert({
      organization_id: ORG_A,
      course_id: courseId,
      offering_id: offering!.id,
      user_id: student.id,
      source: "FREE_COURSE",
    })

    expect(error).not.toBeNull()
  })

  it("a student cannot insert their own enrollment directly", async () => {
    const courseId = await makeCourse(ORG_A, { status: "PUBLISHED", accessType: "FREE" })
    const student = await member("rls-enroll-self", ORG_A, "STUDENT")

    const { data: offering } = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: courseId, organization_id: ORG_A, kind: "OPEN", name: "Oferta abierta 2" })
      .select("id")
      .single()

    const { error } = await student.client.from("course_enrollments").insert({
      organization_id: ORG_A,
      course_id: courseId,
      offering_id: offering!.id,
      user_id: student.id,
      source: "FREE_COURSE",
    })

    expect(error).not.toBeNull()
  })
})
