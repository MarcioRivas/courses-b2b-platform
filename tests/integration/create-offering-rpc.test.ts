import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { psqlBool } from "../helpers/sql"
import { cleanupFixtures, makeAssessmentFixture, makeCourseFixture, type CourseFixture } from "../helpers/course-fixtures"
import { deleteGroups } from "../helpers/edition-fixtures"
import { COURSE_FILES_BUCKET, isPathInsideCourse } from "@/lib/storage/file-path"

/** B3: create_offering (empty edition or copy of another edition of the course). */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"
const PDF_BYTES = Buffer.from("%PDF-1.4 create offering test")

const cleanup: string[] = []
const courseIds: string[] = []
const groupIds: string[] = []
const bankIds: string[] = []
const uploaded: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  if (uploaded.length > 0) await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).remove(uploaded)
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
  await deleteGroups(groupIds)
})

async function newGroup(org = ORG_A): Promise<string> {
  const { data } = await supabaseAdmin
    .from("groups")
    .insert({ organization_id: org, name: `G b3 ${Date.now()}-${Math.random()}` })
    .select("id")
    .single()
  groupIds.push(data!.id)
  return data!.id
}

/** A source edition with two modules, EXAM + TASK (dates), QUIZ block, dependencies, a video checkpoint and a shared PDF. */
async function sourceCourse(
  title: string
): Promise<{ fixture: CourseFixture; examId: string; taskId: string; pdfPath: string; pdfBlock: string }> {
  const fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [
      { title: "Módulo 1", requiredBlocks: 2 },
      { title: "Módulo 2", requiredBlocks: 1 },
    ],
  })
  courseIds.push(fixture.courseId)
  const from = new Date(Date.now() - 3_600_000).toISOString()
  const until = new Date(Date.now() + 3_600_000).toISOString()
  const exam = await makeAssessmentFixture({
    offeringId: fixture.offeringId, organizationId: ORG_A, title: `Examen ${title}`, kind: "EXAM",
    multipleChoice: 1, durationSeconds: 600, availableFrom: from, availableUntil: until,
  })
  bankIds.push(exam.bankId)
  const task = await makeAssessmentFixture({
    offeringId: fixture.offeringId, organizationId: ORG_A, title: `Tarea ${title}`, kind: "TASK", availableUntil: until,
  })
  await supabaseAdmin.from("lesson_content_blocks").insert({
    lesson_id: fixture.modules[0]!.lessonId, type: "QUIZ", position: 5, data: {}, assessment_id: exam.assessmentId, is_required: false,
  })
  await supabaseAdmin.from("module_dependencies").insert([
    { module_id: fixture.modules[1]!.id, condition: "MODULE_COMPLETED", depends_on_module_id: fixture.modules[0]!.id },
    { module_id: fixture.modules[1]!.id, condition: "QUIZ_PASSED", assessment_id: exam.assessmentId, min_score: 40 },
  ])

  const video = fixture.modules[0]!.blockIds[0]!
  await supabaseAdmin.from("lesson_content_blocks").update({ type: "YOUTUBE_VIDEO", data: { videoId: "abc" } }).eq("id", video)
  const cp = await supabaseAdmin.from("video_checkpoints").insert({ organization_id: ORG_A, block_id: video, at_seconds: 7, min_correct: 1 }).select("id").single()
  const cq = await supabaseAdmin.from("video_checkpoint_questions").insert({ checkpoint_id: cp.data!.id, prompt: "¿?", position: 1 }).select("id").single()
  await supabaseAdmin.from("video_checkpoint_options").insert([
    { question_id: cq.data!.id, label: "a", is_correct: true, position: 1 },
    { question_id: cq.data!.id, label: "b", is_correct: false, position: 2 },
  ])

  const pdfPath = `${ORG_A}/${fixture.courseId}/${fixture.offeringId}/${crypto.randomUUID()}-doc.pdf`
  uploaded.push(pdfPath)
  await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).upload(pdfPath, PDF_BYTES, { contentType: "application/pdf" })
  const pdf = await supabaseAdmin
    .from("lesson_content_blocks")
    .insert({ lesson_id: fixture.modules[0]!.lessonId, type: "PDF", position: 6, data: { path: pdfPath, name: "doc.pdf" }, is_required: false })
    .select("id")
    .single()
  return { fixture, examId: exam.assessmentId, taskId: task.assessmentId, pdfPath, pdfBlock: pdf.data!.id }
}

describe("create_offering", () => {
  it("copies into an independent tree: DRAFT EXAM/TASK with dates, remapped links, shared file path", async () => {
    const admin = await member("co-admin", ORG_A, "ADMIN")
    const src = await sourceCourse("Copia B3")
    const group = await newGroup()

    const created = await admin.client.rpc("create_offering", {
      p_course: src.fixture.courseId, p_name: "Edición 2", p_group: group, p_from_offering: src.fixture.offeringId,
    })
    expect(created.error).toBeNull()
    const copyId = created.data!

    const edition = await supabaseAdmin.from("course_offerings").select("kind, group_id, name, status").eq("id", copyId).single()
    expect(edition.data).toEqual({ kind: "GROUP", group_id: group, name: "Edición 2", status: "ACTIVE" })

    const assessments = await supabaseAdmin.from("assessments").select("id, kind, status, available_from, available_until").eq("offering_id", copyId)
    expect(assessments.data).toHaveLength(2)
    const sourceDates = await supabaseAdmin.from("assessments").select("kind, available_from, available_until").eq("offering_id", src.fixture.offeringId)
    for (const copy of assessments.data!) {
      expect(copy.status).toBe("DRAFT")
      const original = sourceDates.data!.find((a) => a.kind === copy.kind)!
      expect(new Date(copy.available_until!).getTime()).toBe(new Date(original.available_until!).getTime())
      expect(copy.available_from === null ? null : new Date(copy.available_from).getTime()).toBe(
        original.available_from === null ? null : new Date(original.available_from).getTime()
      )
    }
    expect(assessments.data!.map((a) => a.kind).sort()).toEqual(["EXAM", "TASK"])
    const copiedExam = assessments.data!.find((a) => a.kind === "EXAM")!

    const modules = await supabaseAdmin.from("modules").select("id").eq("offering_id", copyId)
    const moduleIds = modules.data!.map((m) => m.id)
    expect(moduleIds).toHaveLength(2)
    const deps = await supabaseAdmin.from("module_dependencies").select("module_id, depends_on_module_id, assessment_id").in("module_id", moduleIds)
    expect(deps.data).toHaveLength(2)
    for (const dep of deps.data!) {
      if (dep.depends_on_module_id) expect(moduleIds).toContain(dep.depends_on_module_id)
      if (dep.assessment_id) expect(dep.assessment_id).toBe(copiedExam.id)
    }

    const copiedBlocks = await supabaseAdmin
      .from("lesson_content_blocks")
      .select("id, type, assessment_id, data, lessons!inner(modules!inner(offering_id))")
      .eq("lessons.modules.offering_id", copyId)
    expect(copiedBlocks.data!.find((b) => b.type === "QUIZ")!.assessment_id).toBe(copiedExam.id)
    const copiedVideo = copiedBlocks.data!.find((b) => b.type === "YOUTUBE_VIDEO")!
    const checkpoints = await supabaseAdmin.from("video_checkpoints").select("id").eq("block_id", copiedVideo.id)
    expect(checkpoints.data).toHaveLength(1)

    // Shared file: same object path, still inside the course, still signable.
    const copiedPdf = copiedBlocks.data!.find((b) => b.type === "PDF")!
    expect((copiedPdf.data as { path: string }).path).toBe(src.pdfPath)
    expect(isPathInsideCourse(src.pdfPath, ORG_A, src.fixture.courseId)).toBe(true)
    const signed = await supabaseAdmin.storage.from(COURSE_FILES_BUCKET).createSignedUrl(src.pdfPath, 60)
    expect(signed.error).toBeNull()

    // Independence: editing and deleting the copy leaves the source intact.
    await supabaseAdmin.from("modules").update({ title: "Editado en la copia" }).in("id", moduleIds)
    await supabaseAdmin.from("lesson_content_blocks").delete().eq("id", copiedPdf.id)
    const sourceModules = await supabaseAdmin.from("modules").select("title").eq("offering_id", src.fixture.offeringId).order("position")
    expect(sourceModules.data?.map((m) => m.title)).toEqual(["Módulo 1", "Módulo 2"])
    expect((await supabaseAdmin.from("lesson_content_blocks").select("id").eq("id", src.pdfBlock)).data).toHaveLength(1)
    expect((await supabaseAdmin.from("assessments").select("status").eq("id", src.examId).single()).data?.status).toBe("PUBLISHED")

    // Audit carries the source edition.
    const audit = await supabaseAdmin.from("audit_logs").select("metadata").eq("action", "offering.created").eq("entity_id", copyId).single()
    expect(audit.data?.metadata).toMatchObject({ from_offering: src.fixture.offeringId })
  })

  it("creates an empty edition when no source is given, without schedules, professors or students", async () => {
    const admin = await member("co-admin-empty", ORG_A, "ADMIN")
    const src = await sourceCourse("Vacía B3")
    const created = await admin.client.rpc("create_offering", { p_course: src.fixture.courseId, p_name: "Vacía", p_group: await newGroup() })
    expect(created.error).toBeNull()
    expect((await supabaseAdmin.from("modules").select("id").eq("offering_id", created.data!)).data).toEqual([])
    expect((await supabaseAdmin.from("offering_professors").select("user_id").eq("offering_id", created.data!)).data).toEqual([])
  })

  it("refuses a professor, an admin of another org, a source of another course, a missing group and a FREE course", async () => {
    const admin = await member("co-admin-2", ORG_A, "ADMIN")
    const professor = await member("co-prof", ORG_A, "PROFESSOR")
    const otherAdmin = await member("co-admin-b", ORG_B, "ADMIN")
    const src = await sourceCourse("Refusals B3")
    const other = await makeCourseFixture({ organizationId: ORG_A, title: "Otro curso B3", modules: [] })
    courseIds.push(other.courseId)
    const free = await makeCourseFixture({ organizationId: ORG_A, title: "Libre B3", modules: [], accessType: "FREE" })
    courseIds.push(free.courseId)
    const group = await newGroup()
    const args = { p_course: src.fixture.courseId, p_name: "Nope", p_group: group }

    expect((await professor.client.rpc("create_offering", args)).error?.code).toBe("42501")
    expect((await otherAdmin.client.rpc("create_offering", args)).error?.code).toBe("42501")
    expect((await admin.client.rpc("create_offering", { ...args, p_from_offering: other.offeringId })).error?.message).toContain("COPY_DIFFERENT_COURSE")
    expect((await admin.client.rpc("create_offering", { ...args, p_group: null as unknown as string })).error?.message).toContain("GROUP_REQUIRED")
    expect((await admin.client.rpc("create_offering", { ...args, p_group: await newGroup(ORG_B) })).error?.message).toContain("GROUP_REQUIRED")
    expect((await admin.client.rpc("create_offering", { p_course: free.courseId, p_name: "Nope", p_group: group })).error?.message).toContain("OFFERING_KIND_MISMATCH")

    // Nothing leaked from the refused attempts.
    const editions = await supabaseAdmin.from("course_offerings").select("id").eq("course_id", src.fixture.courseId)
    expect(editions.data).toHaveLength(1)
  })

  it("is granted to authenticated only", () => {
    const sig = "create_offering(uuid, text, uuid, timestamptz, timestamptz, uuid)"
    expect(psqlBool(`select has_function_privilege('authenticated', '${sig}', 'EXECUTE');`)).toBe(true)
    expect(psqlBool(`select has_function_privilege('anon', '${sig}', 'EXECUTE');`)).toBe(false)
  })

  it("two concurrent copies into the same empty edition: one fails", async () => {
    const src = await sourceCourse("Concurrente B3")
    const dest = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: src.fixture.courseId, organization_id: ORG_A, kind: "GROUP", group_id: await newGroup(), name: "Destino concurrente" })
      .select("id")
      .single()
    const results = await Promise.all([
      supabaseAdmin.rpc("copy_edition_content", { p_source: src.fixture.offeringId, p_target: dest.data!.id }),
      supabaseAdmin.rpc("copy_edition_content", { p_source: src.fixture.offeringId, p_target: dest.data!.id }),
    ])
    const failures = results.filter((r) => r.error)
    expect(failures).toHaveLength(1)
    expect(failures[0]!.error!.message).toContain("TARGET_NOT_EMPTY")
    const modules = await supabaseAdmin.from("modules").select("id").eq("offering_id", dest.data!.id)
    expect(modules.data).toHaveLength(2)
  })
})
