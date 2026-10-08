import { afterAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { assignOfferingProfessor, ensureOffering } from "../helpers/course-fixtures"

/**
 * Guards that no other Phase 3 suite covers: the D24 no-client-write rule on
 * `content_progress`, the D13 one-OPEN-offering-per-course index, publish
 * validation, and `can_view_block` — the function that decides whether a file
 * may be signed, so its availability-window logic is a security boundary
 * (D26), not a convenience.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const createdCourseIds: string[] = []

afterAll(async () => {
  if (createdCourseIds.length > 0) {
    await supabaseAdmin.from("courses").delete().in("id", createdCourseIds)
  }
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

const member = createMemberFactory(cleanup)

async function makeCourse(
  status: "DRAFT" | "PUBLISHED" = "PUBLISHED",
  accessType: "FREE" | "PRIVATE" = "PRIVATE"
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .insert({
      organization_id: ORG_A,
      title: `Guard course ${Date.now()}-${Math.random()}`,
      access_type: accessType,
      status,
    })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("course not created")
  createdCourseIds.push(data.id)
  return data.id
}

/** Course → OPEN edition → module → lesson → one required block (content belongs to the edition). Returns the ids. */
async function makeCourseTree(status: "DRAFT" | "PUBLISHED" = "PUBLISHED", accessType: "FREE" | "PRIVATE" = "PRIVATE") {
  const courseId = await makeCourse(status, accessType)
  const offeringId = await ensureOffering(courseId, ORG_A)

  const { data: mod } = await supabaseAdmin
    .from("modules")
    .insert({ offering_id: offeringId, title: "M1", position: 1 })
    .select("id")
    .single()

  const { data: lesson } = await supabaseAdmin
    .from("lessons")
    .insert({ module_id: mod!.id, title: "L1", position: 1 })
    .select("id")
    .single()

  const { data: block } = await supabaseAdmin
    .from("lesson_content_blocks")
    .insert({
      lesson_id: lesson!.id,
      type: "PDF",
      position: 1,
      data: { path: `${ORG_A}/${courseId}/x.pdf`, filename: "x.pdf", sizeBytes: 10 },
    })
    .select("id")
    .single()

  return { courseId, offeringId, moduleId: mod!.id, lessonId: lesson!.id, blockId: block!.id }
}

describe("D24: content_progress has no client write path", () => {
  it("an enrolled student cannot insert their own progress row", async () => {
    const student = await member("cg-progress-student", ORG_A, "STUDENT")
    const { courseId, offeringId, blockId } = await makeCourseTree()

    const offering = { id: offeringId }

    const { data: enrollment } = await supabaseAdmin
      .from("course_enrollments")
      .insert({
        organization_id: ORG_A,
        course_id: courseId,
        offering_id: offering.id,
        user_id: student.id,
        source: "FREE_COURSE",
      })
      .select("id")
      .single()

    // Marking your own block complete is exactly the write a student would
    // want; it must go through complete_content_block in Phase 4 instead.
    const { error } = await student.client
      .from("content_progress")
      .insert({ enrollment_id: enrollment!.id, content_block_id: blockId })

    expect(error).not.toBeNull()
    expect(error?.code).toBe("42501")

    const { count } = await supabaseAdmin
      .from("content_progress")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollment!.id)
    expect(count).toBe(0)
  })

  it("an org admin cannot insert or delete progress either", async () => {
    const admin = await member("cg-progress-admin", ORG_A, "ADMIN")
    const student = await member("cg-progress-target", ORG_A, "STUDENT")
    const { courseId, offeringId, blockId } = await makeCourseTree()

    const offering = { id: offeringId }

    const { data: enrollment } = await supabaseAdmin
      .from("course_enrollments")
      .insert({
        organization_id: ORG_A,
        course_id: courseId,
        offering_id: offering.id,
        user_id: student.id,
        source: "FREE_COURSE",
      })
      .select("id")
      .single()

    const { error: insertError } = await admin.client
      .from("content_progress")
      .insert({ enrollment_id: enrollment!.id, content_block_id: blockId })
    expect(insertError?.code).toBe("42501")

    // A service-role row exists; the admin must not be able to remove it.
    await supabaseAdmin
      .from("content_progress")
      .insert({ enrollment_id: enrollment!.id, content_block_id: blockId })

    await admin.client.from("content_progress").delete().eq("enrollment_id", enrollment!.id)

    const { count } = await supabaseAdmin
      .from("content_progress")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollment!.id)
    expect(count).toBe(1)
  })
})

describe("D13: a course has at most one OPEN offering", () => {
  it("the partial unique index rejects a second OPEN offering", async () => {
    const courseId = await makeCourse()

    const { error: first } = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: courseId, organization_id: ORG_A, kind: "OPEN", name: "Primera" })
    expect(first).toBeNull()

    const { error: second } = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: courseId, organization_id: ORG_A, kind: "OPEN", name: "Segunda" })
    expect(second?.code).toBe("23505")
  })

  it("publishing a FREE course twice still leaves exactly one OPEN offering", async () => {
    const admin = await member("cg-d13-admin", ORG_A, "ADMIN")
    const { courseId } = await makeCourseTree("DRAFT", "FREE")

    await admin.client.rpc("publish_course", { p_course: courseId })
    await admin.client.rpc("publish_course", { p_course: courseId })

    const { count } = await supabaseAdmin
      .from("course_offerings")
      .select("id", { count: "exact", head: true })
      .eq("course_id", courseId)
      .eq("kind", "OPEN")
    expect(count).toBe(1)
  })
})

describe("publish_course validation", () => {
  it("refuses a course with no content and leaves it DRAFT", async () => {
    const admin = await member("cg-publish-admin", ORG_A, "ADMIN")
    const courseId = await makeCourse("DRAFT")

    const { error } = await admin.client.rpc("publish_course", { p_course: courseId })
    expect(error?.code).toBe("22023")
    expect(error?.message).toContain("COURSE_INCOMPLETE")

    const { data } = await supabaseAdmin.from("courses").select("status").eq("id", courseId).single()
    expect(data?.status).toBe("DRAFT")
  })

  it("refuses a course whose module has a lesson but no content block", async () => {
    const admin = await member("cg-publish-admin-2", ORG_A, "ADMIN")
    const courseId = await makeCourse("DRAFT")
    const offeringId = await ensureOffering(courseId, ORG_A)
    const { data: mod } = await supabaseAdmin
      .from("modules")
      .insert({ offering_id: offeringId, title: "M", position: 1 })
      .select("id")
      .single()
    await supabaseAdmin.from("lessons").insert({ module_id: mod!.id, title: "L", position: 1 })

    const { error } = await admin.client.rpc("publish_course", { p_course: courseId })
    expect(error?.message).toContain("COURSE_INCOMPLETE")
  })

  it("a professor of the course cannot publish it", async () => {
    const professor = await member("cg-publish-prof", ORG_A, "PROFESSOR")
    const { courseId } = await makeCourseTree("DRAFT")
    await assignOfferingProfessor(await ensureOffering(courseId, ORG_A), professor.id)

    const { error } = await professor.client.rpc("publish_course", { p_course: courseId })
    expect(error?.code).toBe("42501")
  })
})

describe("can_view_block: the gate in front of every signed URL (D26)", () => {
  async function enrol(userId: string, courseId: string, offeringId: string): Promise<string> {
    const offering = { id: offeringId }

    await supabaseAdmin.from("course_enrollments").insert({
      organization_id: ORG_A,
      course_id: courseId,
      offering_id: offering.id,
      user_id: userId,
      source: "FREE_COURSE",
    })

    return offering.id
  }

  it("allows an enrolled student when the module has no schedule row", async () => {
    const student = await member("cg-view-open", ORG_A, "STUDENT")
    const { courseId, offeringId, blockId } = await makeCourseTree()
    await enrol(student.id, courseId, offeringId)

    const { data } = await student.client.rpc("can_view_block", { p_block: blockId })
    expect(data).toBe(true)
  })

  it("denies an enrolled student before the module opens", async () => {
    const student = await member("cg-view-early", ORG_A, "STUDENT")
    const { courseId, offeringId, moduleId, blockId } = await makeCourseTree()
    await enrol(student.id, courseId, offeringId)

    await supabaseAdmin.from("offering_module_schedules").insert({
      offering_id: offeringId,
      module_id: moduleId,
      available_from: new Date(Date.now() + 86_400_000).toISOString(),
    })

    const { data } = await student.client.rpc("can_view_block", { p_block: blockId })
    expect(data).toBe(false)
  })

  it("denies an enrolled student after the module closes", async () => {
    const student = await member("cg-view-late", ORG_A, "STUDENT")
    const { courseId, offeringId, moduleId, blockId } = await makeCourseTree()
    await enrol(student.id, courseId, offeringId)

    await supabaseAdmin.from("offering_module_schedules").insert({
      offering_id: offeringId,
      module_id: moduleId,
      available_until: new Date(Date.now() - 86_400_000).toISOString(),
    })

    const { data } = await student.client.rpc("can_view_block", { p_block: blockId })
    expect(data).toBe(false)
  })

  it("denies a student of the same org who is not enrolled", async () => {
    const outsider = await member("cg-view-outsider", ORG_A, "STUDENT")
    const { blockId } = await makeCourseTree()

    const { data } = await outsider.client.rpc("can_view_block", { p_block: blockId })
    expect(data).toBe(false)
  })

  it("allows an editor regardless of any schedule window", async () => {
    const admin = await member("cg-view-admin", ORG_A, "ADMIN")
    const { courseId, offeringId, moduleId, blockId } = await makeCourseTree()
    await enrol(admin.id, courseId, offeringId)

    await supabaseAdmin.from("offering_module_schedules").insert({
      offering_id: offeringId,
      module_id: moduleId,
      available_until: new Date(Date.now() - 86_400_000).toISOString(),
    })

    const { data } = await admin.client.rpc("can_view_block", { p_block: blockId })
    expect(data).toBe(true)
  })
})

describe("offering_module_schedules window constraint", () => {
  it("rejects a window that ends before it starts", async () => {
    const { offeringId, moduleId } = await makeCourseTree()
    const offering = { id: offeringId }

    const { error } = await supabaseAdmin.from("offering_module_schedules").insert({
      offering_id: offering.id,
      module_id: moduleId,
      available_from: new Date(Date.now() + 86_400_000).toISOString(),
      available_until: new Date(Date.now() - 86_400_000).toISOString(),
    })

    expect(error?.code).toBe("23514")
  })

  it("accepts a one-sided window", async () => {
    const { offeringId, moduleId } = await makeCourseTree()
    const offering = { id: offeringId }

    const { error } = await supabaseAdmin.from("offering_module_schedules").insert({
      offering_id: offering.id,
      module_id: moduleId,
      available_from: new Date().toISOString(),
    })

    expect(error).toBeNull()
  })
})
