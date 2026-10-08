import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { deleteUser } from "../helpers/make-user"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { assignOfferingProfessor, ensureOffering } from "../helpers/course-fixtures"

/**
 * RLS/RPC coverage for the content builder (Part B): a professor may only
 * write modules/lessons/blocks under courses they're assigned to; a student
 * never writes any of it; a student never reads a DRAFT course's content;
 * the reorder RPCs enforce `can_edit_course` and reject a partial id list.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const member = createMemberFactory(cleanup)
const courseIds: string[] = []

let professorA: Awaited<ReturnType<typeof member>>
let professorB: Awaited<ReturnType<typeof member>>
let studentA: Awaited<ReturnType<typeof member>>
let courseAId: string
let courseBId: string
let draftCourseId: string
let moduleA1Id: string
let moduleA2Id: string
let moduleBId: string
let lessonAId: string
let lessonBId: string
let blockAId: string
let draftLessonId: string

async function createCourse(status: "DRAFT" | "PUBLISHED"): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("courses")
    .insert({ organization_id: ORG_A, title: `Curso ${status} ${Date.now()}`, status, access_type: "PRIVATE" })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("course not created")
  courseIds.push(data.id)
  return data.id
}

async function assignProfessor(courseId: string, userId: string): Promise<void> {
  await assignOfferingProfessor(await ensureOffering(courseId, ORG_A), userId)
}

beforeAll(async () => {
  professorA = await member("cb-prof-a", ORG_A, "PROFESSOR")
  professorB = await member("cb-prof-b", ORG_A, "PROFESSOR")
  studentA = await member("cb-student-a", ORG_A, "STUDENT")

  courseAId = await createCourse("PUBLISHED")
  courseBId = await createCourse("PUBLISHED")
  draftCourseId = await createCourse("DRAFT")

  await assignProfessor(courseAId, professorA.id)
  await assignProfessor(courseBId, professorB.id)

  const { data: modules } = await supabaseAdmin
    .from("modules")
    .insert([
      { course_id: courseAId, title: "Módulo A1", position: 1 },
      { course_id: courseAId, title: "Módulo A2", position: 2 },
      { course_id: courseBId, title: "Módulo B1", position: 1 },
      { course_id: draftCourseId, title: "Módulo Draft", position: 1 },
    ])
    .select("id, course_id, title")
  if (!modules) throw new Error("modules not created")

  moduleA1Id = modules.find((m) => m.title === "Módulo A1")!.id
  moduleA2Id = modules.find((m) => m.title === "Módulo A2")!.id
  moduleBId = modules.find((m) => m.title === "Módulo B1")!.id
  const draftModuleId = modules.find((m) => m.title === "Módulo Draft")!.id

  const { data: lessons } = await supabaseAdmin
    .from("lessons")
    .insert([
      { module_id: moduleA1Id, title: "Lección A", position: 1 },
      { module_id: moduleBId, title: "Lección B", position: 1 },
      { module_id: draftModuleId, title: "Lección Draft", position: 1 },
    ])
    .select("id, module_id, title")
  if (!lessons) throw new Error("lessons not created")

  lessonAId = lessons.find((l) => l.title === "Lección A")!.id
  lessonBId = lessons.find((l) => l.title === "Lección B")!.id
  draftLessonId = lessons.find((l) => l.title === "Lección Draft")!.id

  const { data: block, error: blockError } = await supabaseAdmin
    .from("lesson_content_blocks")
    .insert({ lesson_id: lessonAId, type: "RICH_TEXT", position: 1, data: { html: "<p>hola</p>" } })
    .select("id")
    .single()
  if (blockError || !block) throw blockError ?? new Error("block not created")
  blockAId = block.id

  await supabaseAdmin
    .from("lesson_content_blocks")
    .insert({ lesson_id: draftLessonId, type: "RICH_TEXT", position: 1, data: { html: "<p>draft</p>" } })
})

afterAll(async () => {
  await supabaseAdmin.from("courses").delete().in("id", courseIds)
  await Promise.all(cleanup.map((id) => deleteUser(id)))
})

describe("modules/lessons/blocks write policy", () => {
  it("professor of course A cannot create a module under course B", async () => {
    const { error } = await professorA.client.from("modules").insert({ course_id: courseBId, title: "hack", position: 99 })
    expect(error).not.toBeNull()
  })

  it("professor of course A cannot update a module under course B", async () => {
    const { data } = await professorA.client
      .from("modules")
      .update({ title: "hacked" })
      .eq("id", moduleBId)
      .select("id")
    expect(data).toEqual([])

    const { data: untouched } = await supabaseAdmin.from("modules").select("title").eq("id", moduleBId).single()
    expect(untouched?.title).toBe("Módulo B1")
  })

  it("professor of course A cannot delete a lesson under course B", async () => {
    const { data } = await professorA.client.from("lessons").delete().eq("id", lessonBId).select("id")
    expect(data).toEqual([])

    const { data: stillThere } = await supabaseAdmin.from("lessons").select("id").eq("id", lessonBId).maybeSingle()
    expect(stillThere).not.toBeNull()
  })

  it("professor of course A cannot create a content block under course B", async () => {
    const { error } = await professorA.client
      .from("lesson_content_blocks")
      .insert({ lesson_id: lessonBId, type: "RICH_TEXT", position: 5, data: { html: "<p>x</p>" } })
    expect(error).not.toBeNull()
  })

  it("a student cannot create a module anywhere, including their own org's course", async () => {
    const { error } = await studentA.client.from("modules").insert({ course_id: courseAId, title: "x", position: 50 })
    expect(error).not.toBeNull()
  })

  it("a student cannot update a lesson", async () => {
    const { data } = await studentA.client.from("lessons").update({ title: "hacked" }).eq("id", lessonAId).select("id")
    expect(data).toEqual([])
  })

  it("a student cannot delete a content block", async () => {
    const { data } = await studentA.client.from("lesson_content_blocks").delete().eq("id", blockAId).select("id")
    expect(data).toEqual([])

    const { data: stillThere } = await supabaseAdmin
      .from("lesson_content_blocks")
      .select("id")
      .eq("id", blockAId)
      .maybeSingle()
    expect(stillThere).not.toBeNull()
  })
})

describe("student read visibility", () => {
  it("a student cannot read content blocks of a DRAFT course", async () => {
    const { data } = await studentA.client.from("lesson_content_blocks").select("id").eq("lesson_id", draftLessonId)
    expect(data).toEqual([])
  })

  it("the assigned professor CAN read their own course's blocks (positive control)", async () => {
    const { data } = await professorA.client.from("lesson_content_blocks").select("id").eq("id", blockAId)
    expect(data).toHaveLength(1)
  })
})

describe("reorder RPCs", () => {
  it("reorder_modules rejects a caller who cannot edit the course", async () => {
    const { error } = await professorB.client.rpc("reorder_modules", {
      p_course: courseAId,
      p_ordered_ids: [moduleA1Id, moduleA2Id],
    })
    expect(error).not.toBeNull()
  })

  it("reorder_modules rejects a partial id list from an eligible editor", async () => {
    const { error } = await professorA.client.rpc("reorder_modules", {
      p_course: courseAId,
      p_ordered_ids: [moduleA1Id],
    })
    expect(error).not.toBeNull()
    expect(error?.code).toBe("22023")
  })

  it("reorder_modules succeeds for the assigned professor with the full ordered list", async () => {
    const { error } = await professorA.client.rpc("reorder_modules", {
      p_course: courseAId,
      p_ordered_ids: [moduleA2Id, moduleA1Id],
    })
    expect(error).toBeNull()

    const { data } = await supabaseAdmin.from("modules").select("id, position").eq("id", moduleA2Id).single()
    expect(data?.position).toBe(1)
  })

  it("reorder_lessons rejects a student", async () => {
    const { error } = await studentA.client.rpc("reorder_lessons", {
      p_module: moduleA1Id,
      p_ordered_ids: [lessonAId],
    })
    expect(error).not.toBeNull()
  })
})
