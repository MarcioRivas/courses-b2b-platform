import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { assignOfferingProfessor, cleanupFixtures, makeAssessmentFixture } from "../helpers/course-fixtures"
import { deleteGroups, makeTwoEditionCourse, type TwoEditionCourse } from "../helpers/edition-fixtures"

/** B2 review fixes: cross-edition moves, question insert lock, org stamping, kind and publish guards. */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const groupIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
  await deleteGroups(groupIds)
})

describe("cross-edition moves (editor of both editions)", () => {
  let course: TwoEditionCourse
  let both: Awaited<ReturnType<typeof member>>

  beforeAll(async () => {
    both = await member("hd-both", ORG_A, "PROFESSOR")
    course = await makeTwoEditionCourse(ORG_A, "Curso movimientos")
    courseIds.push(course.courseId)
    groupIds.push(course.groupId)
    await assignOfferingProfessor(course.a.offeringId, both.id)
    await assignOfferingProfessor(course.b.offeringId, both.id)
  }, 60_000)

  it("cannot move a lesson into a module of the other edition", async () => {
    const moved = await both.client.from("lessons").update({ module_id: course.b.moduleId }).eq("id", course.a.lessonId).select("id")
    expect(moved.error?.message).toContain("CROSS_EDITION_LINK")
    const row = await supabaseAdmin.from("lessons").select("module_id").eq("id", course.a.lessonId).single()
    expect(row.data?.module_id).toBe(course.a.moduleId)
  })

  it("cannot move a block into a lesson of the other edition", async () => {
    const moved = await both.client.from("lesson_content_blocks").update({ lesson_id: course.b.lessonId }).eq("id", course.a.blockId).select("id")
    expect(moved.error?.message).toContain("CROSS_EDITION_LINK")
    const row = await supabaseAdmin.from("lesson_content_blocks").select("lesson_id").eq("id", course.a.blockId).single()
    expect(row.data?.lesson_id).toBe(course.a.lessonId)
  })

  it("edits inside the same edition still work", async () => {
    const lesson = await both.client.from("lessons").update({ title: "Renombrada" }).eq("id", course.a.lessonId).select("id")
    expect(lesson.error).toBeNull()
  })
})

describe("question insert into another edition's PUBLISHED random-draw exam", () => {
  it("is refused for the other edition's professor and leaves no orphan", async () => {
    const profB = await member("hd-prof-b", ORG_A, "PROFESSOR")
    const course = await makeTwoEditionCourse(ORG_A, "Curso sorteo cruzado")
    courseIds.push(course.courseId)
    groupIds.push(course.groupId)
    await assignOfferingProfessor(course.b.offeringId, profB.id)

    const fixture = await makeAssessmentFixture({
      offeringId: course.a.offeringId,
      organizationId: ORG_A,
      title: "Examen sorteo A",
      kind: "QUIZ",
      multipleChoice: 2,
    })
    const draw = await supabaseAdmin
      .from("assessments")
      .update({ random_question_count: 1 })
      .eq("id", fixture.assessmentId)
    expect(draw.error).toBeNull()

    const insert = await profB.client.from("questions").insert({
      assessment_id: fixture.assessmentId,
      type: "MULTIPLE_CHOICE",
      prompt: "Intrusa",
      points: 1,
      position: 99,
    })
    expect(insert.error?.code).toBe("42501")

    const orphans = await supabaseAdmin.from("questions").select("id").eq("assessment_id", fixture.assessmentId).eq("prompt", "Intrusa")
    expect(orphans.data).toEqual([])
  }, 60_000)
})

describe("assessments.organization_id follows the edition", () => {
  it("a professor cannot stamp another organization on an evaluation", async () => {
    const prof = await member("hd-org-prof", ORG_A, "PROFESSOR")
    const course = await makeTwoEditionCourse(ORG_A, "Curso org estampada")
    courseIds.push(course.courseId)
    groupIds.push(course.groupId)
    await assignOfferingProfessor(course.a.offeringId, prof.id)

    const inserted = await prof.client
      .from("assessments")
      .insert({ organization_id: ORG_B, offering_id: course.a.offeringId, kind: "QUIZ", status: "DRAFT", title: "Org falsa" })
      .select("id, organization_id")
      .single()
    expect(inserted.error).toBeNull()
    expect(inserted.data?.organization_id).toBe(ORG_A)

    const updated = await prof.client
      .from("assessments")
      .update({ organization_id: ORG_B })
      .eq("id", inserted.data!.id)
      .select("organization_id")
      .single()
    expect(updated.data?.organization_id).toBe(ORG_A)
  }, 60_000)
})

describe("edition guards", () => {
  async function newFreeCourse() {
    const { data } = await supabaseAdmin
      .from("courses")
      .insert({ organization_id: ORG_A, title: `Libre guard ${Date.now()}-${Math.random()}`, access_type: "FREE" })
      .select("id")
      .single()
    courseIds.push(data!.id)
    return data!.id
  }

  it("a FREE course refuses a GROUP edition", async () => {
    const courseId = await newFreeCourse()
    const group = await supabaseAdmin.from("groups").insert({ organization_id: ORG_A, name: `G free ${Date.now()}` }).select("id").single()
    groupIds.push(group.data!.id)
    const refused = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: courseId, organization_id: ORG_A, kind: "GROUP", group_id: group.data!.id, name: "Grupal" })
    expect(refused.error?.message).toContain("OFFERING_KIND_MISMATCH")
  })

  it("publishing a FREE course needs its OPEN edition to be ACTIVE", async () => {
    const admin = await member("hd-admin", ORG_A, "ADMIN")
    const courseId = await newFreeCourse()
    const open = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: courseId, organization_id: ORG_A, kind: "OPEN", name: "Abierta", status: "CANCELLED" })
      .select("id")
      .single()
    const mod = await supabaseAdmin.from("modules").insert({ offering_id: open.data!.id, title: "M", position: 1 }).select("id").single()
    const lesson = await supabaseAdmin.from("lessons").insert({ module_id: mod.data!.id, title: "L", position: 1 }).select("id").single()
    await supabaseAdmin.from("lesson_content_blocks").insert({ lesson_id: lesson.data!.id, type: "RICH_TEXT", position: 1, data: { html: "x" } })

    expect((await admin.client.rpc("publish_course", { p_course: courseId })).error?.message).toContain("COURSE_INCOMPLETE")

    await supabaseAdmin.from("course_offerings").update({ status: "ACTIVE" }).eq("id", open.data!.id)
    expect((await admin.client.rpc("publish_course", { p_course: courseId })).error).toBeNull()
  })

  it("copy_edition_content refuses a CANCELLED destination edition", async () => {
    const course = await makeTwoEditionCourse(ORG_A, "Curso copia cancelada")
    courseIds.push(course.courseId)
    groupIds.push(course.groupId)
    const group = await supabaseAdmin.from("groups").insert({ organization_id: ORG_A, name: `G canc ${Date.now()}` }).select("id").single()
    groupIds.push(group.data!.id)
    const destination = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: course.courseId, organization_id: ORG_A, kind: "GROUP", group_id: group.data!.id, name: "Cancelada", status: "CANCELLED" })
      .select("id")
      .single()
    const copy = await supabaseAdmin.rpc("copy_edition_content", { p_source: course.a.offeringId, p_target: destination.data!.id })
    expect(copy.error?.message).toContain("TARGET_CANCELLED")
  }, 60_000)
})
