import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { assignOfferingProfessor, cleanupFixtures, enrollStudent, makeAssessmentFixture } from "../helpers/course-fixtures"
import { deleteGroups, makeTwoEditionCourse, type TwoEditionCourse } from "../helpers/edition-fixtures"

/**
 * B2: content and evaluations belong to an edition. A professor / student of
 * edition A never reads or writes edition B's modules, lessons, blocks,
 * evaluations or checkpoint keys, even inside the same course.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const groupIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

let course: TwoEditionCourse
let profA: Awaited<ReturnType<typeof member>>
let profB: Awaited<ReturnType<typeof member>>
let studentA: Awaited<ReturnType<typeof member>>
let draftAssessmentB: string
let publishedAssessmentB: string
let checkpointB: string

beforeAll(async () => {
  profA = await member("ec-prof-a", ORG_A, "PROFESSOR")
  profB = await member("ec-prof-b", ORG_A, "PROFESSOR")
  studentA = await member("ec-student-a", ORG_A, "STUDENT")

  course = await makeTwoEditionCourse(ORG_A, "Curso contenido por edición")
  courseIds.push(course.courseId)
  groupIds.push(course.groupId)
  await assignOfferingProfessor(course.a.offeringId, profA.id)
  await assignOfferingProfessor(course.b.offeringId, profB.id)
  await enrollStudent(course.a.fixture, ORG_A, studentA.id)

  const draft = await makeAssessmentFixture({
    offeringId: course.b.offeringId,
    organizationId: ORG_A,
    title: "Borrador B",
    kind: "QUIZ",
    multipleChoice: 1,
    status: "DRAFT",
  })
  const published = await makeAssessmentFixture({
    offeringId: course.b.offeringId,
    organizationId: ORG_A,
    title: "Publicada B",
    kind: "QUIZ",
    multipleChoice: 1,
  })
  bankIds.push(draft.bankId, published.bankId)
  draftAssessmentB = draft.assessmentId
  publishedAssessmentB = published.assessmentId

  await supabaseAdmin.from("lesson_content_blocks").update({ type: "YOUTUBE_VIDEO", data: { videoId: "abc" } }).eq("id", course.b.blockId)
  const { data: checkpoint } = await supabaseAdmin
    .from("video_checkpoints")
    .insert({ organization_id: ORG_A, block_id: course.b.blockId, at_seconds: 10, min_correct: 1 })
    .select("id")
    .single()
  checkpointB = checkpoint!.id
}, 60_000)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
  await deleteGroups(groupIds)
})

describe("professor of edition A vs edition B's content", () => {
  it("positive control: reads and writes its own edition", async () => {
    const own = await profA.client.from("modules").select("id").eq("id", course.a.moduleId)
    expect(own.data).toHaveLength(1)
    const insert = await profA.client.from("modules").insert({ offering_id: course.a.offeringId, title: "Propio", position: 50 })
    expect(insert.error).toBeNull()
  })

  it("cannot read modules, lessons, blocks or dependencies of edition B", async () => {
    expect((await profA.client.from("modules").select("id").eq("id", course.b.moduleId)).data).toEqual([])
    expect((await profA.client.from("lessons").select("id").eq("id", course.b.lessonId)).data).toEqual([])
    expect((await profA.client.from("lesson_content_blocks").select("id").eq("id", course.b.blockId)).data).toEqual([])
  })

  it("cannot read draft or published evaluations of edition B", async () => {
    const rows = await profA.client.from("assessments").select("id").in("id", [draftAssessmentB, publishedAssessmentB])
    expect(rows.data).toEqual([])
    const questions = await profA.client.from("assessment_questions").select("id").eq("assessment_id", draftAssessmentB)
    expect(questions.data).toEqual([])
  })

  it("cannot read the answer key (checkpoints) of edition B", async () => {
    expect((await profA.client.from("video_checkpoints").select("id").eq("id", checkpointB)).data).toEqual([])
    expect((await profB.client.from("video_checkpoints").select("id").eq("id", checkpointB)).data).toHaveLength(1)
  })

  it("cannot write modules, lessons, blocks or evaluations of edition B", async () => {
    const moduleInsert = await profA.client.from("modules").insert({ offering_id: course.b.offeringId, title: "hack", position: 77 })
    expect(moduleInsert.error).not.toBeNull()

    const lessonInsert = await profA.client.from("lessons").insert({ module_id: course.b.moduleId, title: "hack", position: 77 })
    expect(lessonInsert.error).not.toBeNull()

    const blockInsert = await profA.client
      .from("lesson_content_blocks")
      .insert({ lesson_id: course.b.lessonId, type: "RICH_TEXT", position: 77, data: { html: "x" } })
    expect(blockInsert.error).not.toBeNull()

    const assessmentInsert = await profA.client
      .from("assessments")
      .insert({ organization_id: ORG_A, offering_id: course.b.offeringId, kind: "QUIZ", title: "hack" })
    expect(assessmentInsert.error).not.toBeNull()

    const update = await profA.client.from("assessments").update({ title: "hack" }).eq("id", draftAssessmentB).select("id")
    expect(update.data).toEqual([])
  })

  it("cannot save checkpoints, set questions, extend or delete edition B's evaluations (RPCs)", async () => {
    const save = await profA.client.rpc("save_video_checkpoints", { p_block: course.b.blockId, p_checkpoints: [] })
    expect(save.error?.code).toBe("42501")
    const questions = await profA.client.rpc("set_assessment_questions", { p_assessment: draftAssessmentB, p_items: [] })
    expect(questions.error?.code).toBe("42501")
    const remove = await profA.client.rpc("delete_assessment", { p_assessment: draftAssessmentB })
    expect(remove.error?.code).toBe("42501")
    const extend = await profA.client.rpc("extend_assessment_window", {
      p_assessment: publishedAssessmentB,
      p_new_until: new Date(Date.now() + 86_400_000).toISOString(),
    })
    expect(extend.error?.code).toBe("42501")
    const reorder = await profA.client.rpc("reorder_modules", { p_offering: course.b.offeringId, p_ordered_ids: [course.b.moduleId] })
    expect(reorder.error?.code).toBe("42501")
    const deleteModule = await profA.client.rpc("delete_module", { p_module: course.b.moduleId })
    expect(deleteModule.error?.code).toBe("42501")
  })
})

describe("student of edition A vs edition B's content", () => {
  it("positive control: reads their own edition and can_view_block is true", async () => {
    expect((await studentA.client.from("modules").select("id").eq("id", course.a.moduleId)).data).toHaveLength(1)
    expect((await studentA.client.rpc("can_view_block", { p_block: course.a.blockId })).data).toBe(true)
  })

  it("cannot read edition B's modules, blocks or published evaluations", async () => {
    expect((await studentA.client.from("modules").select("id").eq("id", course.b.moduleId)).data).toEqual([])
    expect((await studentA.client.from("lesson_content_blocks").select("id").eq("id", course.b.blockId)).data).toEqual([])
    expect((await studentA.client.from("assessments").select("id").eq("id", publishedAssessmentB)).data).toEqual([])
    expect((await studentA.client.rpc("can_view_block", { p_block: course.b.blockId })).data).toBe(false)
  })

  it("cannot start an evaluation of another edition with their own enrollment", async () => {
    const enrollment = await supabaseAdmin
      .from("course_enrollments")
      .select("id")
      .eq("offering_id", course.a.offeringId)
      .eq("user_id", studentA.id)
      .single()
    const { error } = await studentA.client.rpc("start_attempt", {
      p_enrollment: enrollment.data!.id,
      p_assessment: publishedAssessmentB,
    })
    expect(error?.code).toBe("P0002")
  })
})

describe("student_can_view_offering mirrors every guard", () => {
  async function visibleTo(client: typeof studentA.client, offeringId: string): Promise<boolean> {
    const { data } = await client.rpc("student_can_view_offering", { p_offering: offeringId })
    return data === true
  }

  it("refuses a CANCELLED enrollment, an archived course and a cancelled edition", async () => {
    const enrollmentId = (
      await supabaseAdmin
        .from("course_enrollments")
        .select("id")
        .eq("offering_id", course.a.offeringId)
        .eq("user_id", studentA.id)
        .single()
    ).data!.id
    expect(await visibleTo(studentA.client, course.a.offeringId)).toBe(true)

    await supabaseAdmin.from("course_enrollments").update({ status: "CANCELLED" }).eq("id", enrollmentId)
    expect(await visibleTo(studentA.client, course.a.offeringId)).toBe(false)
    expect((await studentA.client.from("modules").select("id").eq("id", course.a.moduleId)).data).toEqual([])
    await supabaseAdmin.from("course_enrollments").update({ status: "ACTIVE" }).eq("id", enrollmentId)

    await supabaseAdmin.from("courses").update({ status: "ARCHIVED" }).eq("id", course.courseId)
    expect(await visibleTo(studentA.client, course.a.offeringId)).toBe(false)
    await supabaseAdmin.from("courses").update({ status: "PUBLISHED" }).eq("id", course.courseId)

    await supabaseAdmin.from("course_offerings").update({ status: "CANCELLED" }).eq("id", course.a.offeringId)
    expect(await visibleTo(studentA.client, course.a.offeringId)).toBe(false)
    await supabaseAdmin.from("course_offerings").update({ status: "ACTIVE" }).eq("id", course.a.offeringId)
    expect(await visibleTo(studentA.client, course.a.offeringId)).toBe(true)
  })

  it("a FREE course is readable only through its OPEN edition, by members of its organization", async () => {
    const outsider = await member("ec-free-outsider", ORG_B, "STUDENT")
    const insider = await member("ec-free-insider", ORG_A, "STUDENT")
    const free = await supabaseAdmin
      .from("courses")
      .insert({ organization_id: ORG_A, title: `Libre ${Date.now()}`, status: "PUBLISHED", access_type: "FREE" })
      .select("id")
      .single()
    courseIds.push(free.data!.id)
    const open = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: free.data!.id, organization_id: ORG_A, kind: "OPEN", name: "Abierta" })
      .select("id")
      .single()

    expect(await visibleTo(insider.client, open.data!.id)).toBe(true)
    expect(await visibleTo(outsider.client, open.data!.id)).toBe(false)

    const group = await supabaseAdmin
      .from("groups")
      .insert({ organization_id: ORG_A, name: `Grupo libre ${Date.now()}` })
      .select("id")
      .single()
    groupIds.push(group.data!.id)
    const grouped = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: free.data!.id, organization_id: ORG_A, kind: "GROUP", group_id: group.data!.id, name: "Grupo" })
      .select("id")
      .single()
    // A GROUP edition of a FREE course can no longer exist (trigger), so it can never leak the course.
    expect(grouped.error?.message).toContain("OFFERING_KIND_MISMATCH")
    expect(grouped.data).toBeNull()
  })
})

describe("same-edition triggers", () => {
  it("refuses a block that points at another edition's evaluation", async () => {
    const quiz = await makeAssessmentFixture({ offeringId: course.a.offeringId, organizationId: ORG_A, title: "Quiz A", kind: "QUIZ", multipleChoice: 1 })
    bankIds.push(quiz.bankId)
    const { error } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({ lesson_id: course.b.lessonId, type: "QUIZ", position: 40, data: {}, assessment_id: quiz.assessmentId })
    expect(error?.message).toContain("CROSS_EDITION_LINK")

    const ok = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({ lesson_id: course.a.lessonId, type: "QUIZ", position: 40, data: {}, assessment_id: quiz.assessmentId })
    expect(ok.error).toBeNull()
  })

  it("refuses dependencies that cross editions (module or evaluation)", async () => {
    const moduleDep = await supabaseAdmin
      .from("module_dependencies")
      .insert({ module_id: course.a.moduleId, condition: "MODULE_COMPLETED", depends_on_module_id: course.b.moduleId })
    expect(moduleDep.error?.message).toContain("CROSS_EDITION_LINK")

    const quizDep = await supabaseAdmin
      .from("module_dependencies")
      .insert({ module_id: course.a.moduleId, condition: "QUIZ_PASSED", assessment_id: publishedAssessmentB, min_score: 50 })
    expect(quizDep.error?.message).toContain("CROSS_EDITION_LINK")
  })

  it("never moves a module or an evaluation to another edition, nor links an evaluation to a foreign module", async () => {
    const moveModule = await supabaseAdmin.from("modules").update({ offering_id: course.b.offeringId }).eq("id", course.a.moduleId)
    expect(moveModule.error?.message).toContain("CROSS_EDITION_LINK")
    const moveAssessment = await supabaseAdmin.from("assessments").update({ offering_id: course.a.offeringId }).eq("id", draftAssessmentB)
    expect(moveAssessment.error?.message).toContain("CROSS_EDITION_LINK")
    const foreignModule = await supabaseAdmin.from("assessments").update({ module_id: course.a.moduleId }).eq("id", draftAssessmentB)
    expect(foreignModule.error?.message).toContain("CROSS_EDITION_LINK")
  })
})
