import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { psqlBool } from "../helpers/sql"
import {
  assignOfferingProfessor,
  cleanupFixtures,
  makeAssessmentFixture,
  makeCourseFixture,
} from "../helpers/course-fixtures"
import { deleteGroups, makeTwoEditionCourse, type TwoEditionCourse } from "../helpers/edition-fixtures"

/**
 * B2 RPCs: create_course (+ OPEN edition for FREE), the access-type lock, the
 * publish guards, the shared-bank edit lock and copy_edition_content.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const groupIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
  await deleteGroups(groupIds)
})

describe("create_course", () => {
  it("creates a PRIVATE course without editions and a FREE course with its OPEN edition", async () => {
    const admin = await member("cc-admin", ORG_A, "ADMIN")

    const priv = await admin.client.rpc("create_course", {
      p_organization: ORG_A, p_title: "Privado RPC", p_description: "d", p_access_type: "PRIVATE",
    })
    expect(priv.error).toBeNull()
    courseIds.push(priv.data!)
    const privEditions = await supabaseAdmin.from("course_offerings").select("id").eq("course_id", priv.data!)
    expect(privEditions.data).toEqual([])

    const free = await admin.client.rpc("create_course", {
      p_organization: ORG_A, p_title: "Libre RPC", p_description: "", p_access_type: "FREE",
    })
    expect(free.error).toBeNull()
    courseIds.push(free.data!)
    const editions = await supabaseAdmin.from("course_offerings").select("kind, name, status").eq("course_id", free.data!)
    expect(editions.data).toEqual([{ kind: "OPEN", name: "Libre RPC", status: "ACTIVE" }])

    const row = await supabaseAdmin.from("courses").select("created_by, status, description").eq("id", free.data!).single()
    expect(row.data).toMatchObject({ created_by: admin.id, status: "DRAFT", description: null })
  })

  it("refuses a professor, an admin of another org and an empty title", async () => {
    const professor = await member("cc-prof", ORG_A, "PROFESSOR")
    const otherAdmin = await member("cc-admin-b", ORG_B, "ADMIN")
    const admin = await member("cc-admin-2", ORG_A, "ADMIN")
    const args = { p_organization: ORG_A, p_title: "Intruso", p_description: "", p_access_type: "FREE" as const }

    expect((await professor.client.rpc("create_course", args)).error?.code).toBe("42501")
    expect((await otherAdmin.client.rpc("create_course", args)).error?.code).toBe("42501")
    expect((await admin.client.rpc("create_course", { ...args, p_title: " " })).error?.code).toBe("22023")
  })
})

describe("access type lock (ACCESS_TYPE_LOCKED)", () => {
  it("refuses switching access type once the course has an edition, allows it before", async () => {
    const free = await supabaseAdmin
      .from("courses")
      .insert({ organization_id: ORG_A, title: `Lock ${Date.now()}`, access_type: "PRIVATE" })
      .select("id")
      .single()
    courseIds.push(free.data!.id)

    const before = await supabaseAdmin.from("courses").update({ access_type: "FREE" }).eq("id", free.data!.id)
    expect(before.error).toBeNull()

    await supabaseAdmin.from("course_offerings").insert({ course_id: free.data!.id, organization_id: ORG_A, kind: "OPEN", name: "E" })
    const after = await supabaseAdmin.from("courses").update({ access_type: "PRIVATE" }).eq("id", free.data!.id)
    expect(after.error?.message).toContain("ACCESS_TYPE_LOCKED")
    const renamed = await supabaseAdmin.from("courses").update({ title: "Otro título" }).eq("id", free.data!.id)
    expect(renamed.error).toBeNull()
  })
})

describe("publish_course guards", () => {
  async function newCourse(access: "FREE" | "PRIVATE") {
    const { data } = await supabaseAdmin
      .from("courses")
      .insert({ organization_id: ORG_A, title: `Pub ${access} ${Date.now()}-${Math.random()}`, access_type: access })
      .select("id")
      .single()
    courseIds.push(data!.id)
    return data!.id
  }

  async function addBlock(offeringId: string) {
    const { data: mod } = await supabaseAdmin.from("modules").insert({ offering_id: offeringId, title: "M", position: 1 }).select("id").single()
    const { data: lesson } = await supabaseAdmin.from("lessons").insert({ module_id: mod!.id, title: "L", position: 1 }).select("id").single()
    await supabaseAdmin.from("lesson_content_blocks").insert({ lesson_id: lesson!.id, type: "RICH_TEXT", position: 1, data: { html: "x" } })
  }

  it("FREE: an OPEN edition without blocks refuses; with a block it publishes", async () => {
    const admin = await member("pg-admin-free", ORG_A, "ADMIN")
    const created = await admin.client.rpc("create_course", { p_organization: ORG_A, p_title: "Libre guard", p_description: "", p_access_type: "FREE" })
    courseIds.push(created.data!)

    const refused = await admin.client.rpc("publish_course", { p_course: created.data! })
    expect(refused.error?.message).toContain("COURSE_INCOMPLETE")

    const open = await supabaseAdmin.from("course_offerings").select("id").eq("course_id", created.data!).single()
    await addBlock(open.data!.id)
    const published = await admin.client.rpc("publish_course", { p_course: created.data! })
    expect(published.error).toBeNull()
    const row = await supabaseAdmin.from("courses").select("status").eq("id", created.data!).single()
    expect(row.data?.status).toBe("PUBLISHED")
  })

  it("FREE inserted without an edition: the safety net creates it, then the content check refuses", async () => {
    const admin = await member("pg-admin-safety", ORG_A, "ADMIN")
    const courseId = await newCourse("FREE")
    const refused = await admin.client.rpc("publish_course", { p_course: courseId })
    expect(refused.error?.message).toContain("COURSE_INCOMPLETE")
    // The refusal rolls the whole call back, edition included.
    const editions = await supabaseAdmin.from("course_offerings").select("id").eq("course_id", courseId)
    expect(editions.data).toEqual([])
  })

  it("PRIVATE: needs some edition with a block; empty editions refuse", async () => {
    const admin = await member("pg-admin-priv", ORG_A, "ADMIN")
    const courseId = await newCourse("PRIVATE")
    const group = await supabaseAdmin.from("groups").insert({ organization_id: ORG_A, name: `G pub ${Date.now()}` }).select("id").single()
    groupIds.push(group.data!.id)
    const empty = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: courseId, organization_id: ORG_A, kind: "GROUP", group_id: group.data!.id, name: "Vacía" })
      .select("id")
      .single()

    expect((await admin.client.rpc("publish_course", { p_course: courseId })).error?.message).toContain("COURSE_INCOMPLETE")

    const group2 = await supabaseAdmin.from("groups").insert({ organization_id: ORG_A, name: `G pub2 ${Date.now()}` }).select("id").single()
    groupIds.push(group2.data!.id)
    const filled = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: courseId, organization_id: ORG_A, kind: "GROUP", group_id: group2.data!.id, name: "Con contenido" })
      .select("id")
      .single()
    await addBlock(filled.data!.id)
    expect(empty.data).not.toBeNull()
    expect((await admin.client.rpc("publish_course", { p_course: courseId })).error).toBeNull()
  })
})

describe("shared question banks: QUESTION_IN_USE_ELSEWHERE", () => {
  let course: TwoEditionCourse
  let profA: Awaited<ReturnType<typeof member>>
  let profB: Awaited<ReturnType<typeof member>>
  let questionId: string
  let optionId: string
  let assessmentId: string

  beforeAll(async () => {
    profA = await member("qb-prof-a", ORG_A, "PROFESSOR")
    profB = await member("qb-prof-b", ORG_A, "PROFESSOR")
    course = await makeTwoEditionCourse(ORG_A, "Curso banco compartido")
    courseIds.push(course.courseId)
    groupIds.push(course.groupId)
    await assignOfferingProfessor(course.a.offeringId, profA.id)
    await assignOfferingProfessor(course.b.offeringId, profB.id)

    const fixture = await makeAssessmentFixture({
      offeringId: course.a.offeringId,
      organizationId: ORG_A,
      title: "Examen A publicado",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(fixture.bankId)
    assessmentId = fixture.assessmentId
    questionId = fixture.questions[0]!.questionId
    optionId = fixture.questions[0]!.correctOptionId!
  }, 60_000)

  it("the professor of the evaluation's edition can edit the question and its options", async () => {
    expect((await profA.client.from("questions").update({ prompt: "Editada por A" }).eq("id", questionId).select("id")).error).toBeNull()
    expect((await profA.client.from("question_options").update({ label: "Editada" }).eq("id", optionId).select("id")).error).toBeNull()
  })

  it("another edition's professor is locked out of questions used by a PUBLISHED evaluation", async () => {
    const question = await profB.client.from("questions").update({ prompt: "Hack" }).eq("id", questionId).select("id")
    expect(question.error?.message).toContain("QUESTION_IN_USE_ELSEWHERE")

    const option = await profB.client.from("question_options").update({ is_correct: false }).eq("id", optionId).select("id")
    expect(option.error?.message).toContain("QUESTION_IN_USE_ELSEWHERE")

    const insertOption = await profB.client.from("question_options").insert({ question_id: questionId, label: "extra", position: 9 })
    expect(insertOption.error?.message).toContain("QUESTION_IN_USE_ELSEWHERE")

    const row = await supabaseAdmin.from("questions").select("prompt").eq("id", questionId).single()
    expect(row.data?.prompt).toBe("Editada por A")
  })

  it("reading the shared bank across editions is still allowed", async () => {
    const read = await profB.client.from("questions").select("id").eq("id", questionId)
    expect(read.data).toHaveLength(1)
  })

  it("the lock lifts when the evaluation is no longer PUBLISHED", async () => {
    await supabaseAdmin.from("assessments").update({ status: "DRAFT" }).eq("id", assessmentId)
    const question = await profB.client.from("questions").update({ prompt: "Ahora sí" }).eq("id", questionId).select("id")
    expect(question.error).toBeNull()
    await supabaseAdmin.from("assessments").update({ status: "PUBLISHED" }).eq("id", assessmentId)
  })
})

describe("copy_edition_content", () => {
  it("is internal: not executable by authenticated or anon", () => {
    expect(psqlBool("select has_function_privilege('authenticated', 'copy_edition_content(uuid, uuid)', 'EXECUTE');")).toBe(false)
    expect(psqlBool("select has_function_privilege('anon', 'copy_edition_content(uuid, uuid)', 'EXECUTE');")).toBe(false)
  })

  it("copies content, DRAFT evaluations with their dates, dependencies and checkpoints; refuses a non-empty or foreign target", async () => {
    const source = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Origen copia",
      modules: [
        { title: "Módulo 1", requiredBlocks: 1 },
        { title: "Módulo 2", requiredBlocks: 1 },
      ],
    })
    courseIds.push(source.courseId)

    const from = new Date(Date.now() - 3_600_000).toISOString()
    const until = new Date(Date.now() + 3_600_000).toISOString()
    const exam = await makeAssessmentFixture({
      offeringId: source.offeringId, organizationId: ORG_A, title: "Examen origen", kind: "EXAM",
      multipleChoice: 1, durationSeconds: 600, availableFrom: from, availableUntil: until,
    })
    bankIds.push(exam.bankId)
    await supabaseAdmin.from("lesson_content_blocks").insert({
      lesson_id: source.modules[0]!.lessonId, type: "QUIZ", position: 5, data: {}, assessment_id: exam.assessmentId, is_required: false,
    })
    await supabaseAdmin.from("module_dependencies").insert([
      { module_id: source.modules[1]!.id, condition: "MODULE_COMPLETED", depends_on_module_id: source.modules[0]!.id },
      { module_id: source.modules[1]!.id, condition: "QUIZ_PASSED", assessment_id: exam.assessmentId, min_score: 40 },
    ])
    const video = source.modules[0]!.blockIds[0]!
    await supabaseAdmin.from("lesson_content_blocks").update({ type: "YOUTUBE_VIDEO", data: { videoId: "abc" } }).eq("id", video)
    const cp = await supabaseAdmin.from("video_checkpoints").insert({ organization_id: ORG_A, block_id: video, at_seconds: 5, min_correct: 1 }).select("id").single()
    const cq = await supabaseAdmin.from("video_checkpoint_questions").insert({ checkpoint_id: cp.data!.id, prompt: "¿?", position: 1 }).select("id").single()
    await supabaseAdmin.from("video_checkpoint_options").insert([
      { question_id: cq.data!.id, label: "a", is_correct: true, position: 1 },
      { question_id: cq.data!.id, label: "b", is_correct: false, position: 2 },
    ])

    const group = await supabaseAdmin.from("groups").insert({ organization_id: ORG_A, name: `G copia ${Date.now()}` }).select("id").single()
    groupIds.push(group.data!.id)
    const target = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: source.courseId, organization_id: ORG_A, kind: "GROUP", group_id: group.data!.id, name: "Destino" })
      .select("id")
      .single()
    const targetId = target.data!.id

    const copied = await supabaseAdmin.rpc("copy_edition_content", { p_source: source.offeringId, p_target: targetId })
    expect(copied.error).toBeNull()

    const modules = await supabaseAdmin.from("modules").select("id, title, position").eq("offering_id", targetId).order("position")
    expect(modules.data?.map((m) => m.title)).toEqual(["Módulo 1", "Módulo 2"])
    expect(modules.data?.map((m) => m.id)).not.toContain(source.modules[0]!.id)

    const assessments = await supabaseAdmin.from("assessments").select("id, status, available_from, available_until, kind").eq("offering_id", targetId)
    expect(assessments.data).toHaveLength(1)
    expect(assessments.data![0]!.status).toBe("DRAFT")
    expect(new Date(assessments.data![0]!.available_until!).getTime()).toBe(new Date(until).getTime())
    expect(new Date(assessments.data![0]!.available_from!).getTime()).toBe(new Date(from).getTime())
    const copiedQuestions = await supabaseAdmin.from("assessment_questions").select("id").eq("assessment_id", assessments.data![0]!.id)
    expect(copiedQuestions.data).toHaveLength(1)

    // The QUIZ block and both dependencies point at the COPIED rows.
    const blocks = await supabaseAdmin.from("lesson_content_blocks").select("assessment_id, lessons!inner(modules!inner(offering_id))").eq("lessons.modules.offering_id", targetId).not("assessment_id", "is", null)
    expect(blocks.data?.map((b) => b.assessment_id)).toEqual([assessments.data![0]!.id])
    const deps = await supabaseAdmin.from("module_dependencies").select("module_id, depends_on_module_id, assessment_id").in("module_id", modules.data!.map((m) => m.id))
    expect(deps.data).toHaveLength(2)
    for (const dep of deps.data!) {
      expect(modules.data!.map((m) => m.id)).toContain(dep.module_id)
      if (dep.depends_on_module_id) expect(modules.data!.map((m) => m.id)).toContain(dep.depends_on_module_id)
      if (dep.assessment_id) expect(dep.assessment_id).toBe(assessments.data![0]!.id)
    }

    const copiedCheckpoints = await supabaseAdmin
      .from("video_checkpoints")
      .select("id, video_checkpoint_questions(video_checkpoint_options(id))")
      .eq("at_seconds", 5)
      .neq("block_id", video)
      .in("block_id", (await supabaseAdmin.from("lesson_content_blocks").select("id, lessons!inner(modules!inner(offering_id))").eq("lessons.modules.offering_id", targetId)).data!.map((b) => b.id))
    expect(copiedCheckpoints.data).toHaveLength(1)
    expect(copiedCheckpoints.data![0]!.video_checkpoint_questions[0]!.video_checkpoint_options).toHaveLength(2)

    // Source untouched; nothing else was copied.
    const sourceAssessment = await supabaseAdmin.from("assessments").select("status").eq("id", exam.assessmentId).single()
    expect(sourceAssessment.data?.status).toBe("PUBLISHED")
    expect((await supabaseAdmin.from("offering_module_schedules").select("id").eq("offering_id", targetId)).data).toEqual([])

    // Non-empty target and a foreign course are refused.
    const again = await supabaseAdmin.rpc("copy_edition_content", { p_source: source.offeringId, p_target: targetId })
    expect(again.error?.message).toContain("TARGET_NOT_EMPTY")
    const other = await makeCourseFixture({ organizationId: ORG_A, title: "Otro curso copia", modules: [] })
    courseIds.push(other.courseId)
    const foreign = await supabaseAdmin.rpc("copy_edition_content", { p_source: source.offeringId, p_target: other.offeringId })
    expect(foreign.error?.message).toContain("COPY_DIFFERENT_COURSE")
    const self = await supabaseAdmin.rpc("copy_edition_content", { p_source: source.offeringId, p_target: source.offeringId })
    expect(self.error?.message).toContain("COPY_INVALID")
  })
})

describe("authoring RPCs of the owning edition", () => {
  it("reorder, extend window and delete block work for the edition's professor and stay inside it", async () => {
    const prof = await member("ar-prof", ORG_A, "PROFESSOR")
    const course = await makeTwoEditionCourse(ORG_A, "Curso RPC por edición")
    courseIds.push(course.courseId)
    groupIds.push(course.groupId)
    await assignOfferingProfessor(course.a.offeringId, prof.id)

    const reorder = await prof.client.rpc("reorder_modules", { p_offering: course.a.offeringId, p_ordered_ids: [course.a.moduleId] })
    expect(reorder.error).toBeNull()
    // A module of the other edition is never touched by this edition's reorder.
    await prof.client.rpc("reorder_modules", { p_offering: course.a.offeringId, p_ordered_ids: [course.b.moduleId] })
    const untouched = await supabaseAdmin.from("modules").select("position").eq("id", course.b.moduleId).single()
    expect(untouched.data?.position).toBe(1)

    const exam = await makeAssessmentFixture({
      offeringId: course.a.offeringId, organizationId: ORG_A, title: "Examen extender", kind: "EXAM", openEnded: 1,
      durationSeconds: 600, availableFrom: new Date().toISOString(), availableUntil: new Date(Date.now() + 3_600_000).toISOString(),
    })
    bankIds.push(exam.bankId)
    const extended = await prof.client.rpc("extend_assessment_window", {
      p_assessment: exam.assessmentId,
      p_new_until: new Date(Date.now() + 2 * 3_600_000).toISOString(),
    })
    expect(extended.error).toBeNull()
    expect(extended.data).toBe(0)

    const removed = await prof.client.rpc("delete_content_block", { p_block: course.a.blockId })
    expect(removed.error).toBeNull()
    expect(removed.data).toBeNull()
    expect((await supabaseAdmin.from("lesson_content_blocks").select("id").eq("id", course.b.blockId)).data).toHaveLength(1)
  })

  it("my_enrollment_summaries exposes the edition", async () => {
    const student = await member("ar-student", ORG_A, "STUDENT")
    const course = await makeTwoEditionCourse(ORG_A, "Curso resumen")
    courseIds.push(course.courseId)
    groupIds.push(course.groupId)
    await supabaseAdmin.from("course_enrollments").insert({
      organization_id: ORG_A, course_id: course.courseId, offering_id: course.b.offeringId, user_id: student.id, source: "GROUP_ASSIGNMENT", total_blocks: 1,
    })
    const { data } = await student.client.rpc("my_enrollment_summaries")
    expect(data?.map((row) => row.offering_id)).toEqual([course.b.offeringId])
  })
})
