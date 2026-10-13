import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  assignOfferingProfessor,
  cleanupFixtures,
  enrollStudent,
  makeCourseFixture,
  type CourseFixture,
} from "../helpers/course-fixtures"

/**
 * Inline assessments: a QUIZ/TASK is born with its block, owns its questions,
 * and is copied (never shared) with its edition.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const groupIds: string[] = []
const member = createMemberFactory(cleanup)

type Member = Awaited<ReturnType<typeof member>>
let professor: Member
let outsider: Member
let course: CourseFixture

const mc = (prompt: string, extra: Record<string, unknown> = {}) => ({
  type: "MULTIPLE_CHOICE",
  prompt,
  points: 1,
  options: [
    { label: "Correcta", isCorrect: true },
    { label: "Incorrecta", isCorrect: false },
  ],
  ...extra,
})

async function createQuiz(title: string): Promise<{ blockId: string; assessmentId: string }> {
  const { data, error } = await professor.client.rpc("create_assessment_block", {
    p_lesson: course.modules[0]!.lessonId,
    p_kind: "QUIZ",
    p_is_required: false,
    p_config: { title, passingScore: 60 },
  })
  expect(error).toBeNull()
  return data as { blockId: string; assessmentId: string }
}

async function questionsOf(assessmentId: string) {
  const { data } = await supabaseAdmin
    .from("questions")
    .select("id, prompt, position, question_options(label, is_correct)")
    .eq("assessment_id", assessmentId)
    .order("position")
  return data ?? []
}

beforeAll(async () => {
  professor = await member("inline-prof", ORG_A, "PROFESSOR")
  outsider = await member("inline-outsider", ORG_A, "PROFESSOR")
  course = await makeCourseFixture({
    organizationId: ORG_A,
    title: "Curso evaluaciones inline",
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)
  await assignOfferingProfessor(course.offeringId, professor.id)
})

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
  if (groupIds.length > 0) await supabaseAdmin.from("groups").delete().in("id", groupIds)
})

describe("create_assessment_block", () => {
  it("creates the assessment and its block together, as DRAFT", async () => {
    const { blockId, assessmentId } = await createQuiz("Quiz nacido con su bloque")
    const { data: block } = await supabaseAdmin.from("lesson_content_blocks").select("type, assessment_id").eq("id", blockId).single()
    const { data: assessment } = await supabaseAdmin.from("assessments").select("kind, status, offering_id").eq("id", assessmentId).single()
    expect(block).toEqual({ type: "QUIZ", assessment_id: assessmentId })
    expect(assessment).toEqual({ kind: "QUIZ", status: "DRAFT", offering_id: course.offeringId })
  })

  it("refuses EXAM (edition-level, never a block) and a professor of another edition", async () => {
    const exam = await professor.client.rpc("create_assessment_block", {
      p_lesson: course.modules[0]!.lessonId,
      p_kind: "EXAM",
      p_is_required: false,
      p_config: { title: "Examen en bloque", passingScore: 60 },
    })
    expect(exam.error?.code).toBe("22023")

    const foreign = await outsider.client.rpc("create_assessment_block", {
      p_lesson: course.modules[0]!.lessonId,
      p_kind: "QUIZ",
      p_is_required: false,
      p_config: { title: "Intrusa", passingScore: 60 },
    })
    expect(foreign.error?.code).toBe("42501")
  })

  it("rejects pointing a second block at an assessment, or a block at the wrong kind", async () => {
    const { assessmentId } = await createQuiz("Quiz único")
    const second = await supabaseAdmin.from("lesson_content_blocks").insert({
      lesson_id: course.modules[0]!.lessonId, type: "QUIZ", position: 50, data: {}, assessment_id: assessmentId,
    })
    expect(second.error?.code).toBe("23505")

    const task = await supabaseAdmin.from("lesson_content_blocks").update({ type: "TASK" }).eq("assessment_id", assessmentId)
    expect(task.error?.message).toContain("BLOCK_ASSESSMENT_KIND_MISMATCH")
  })
})

describe("save_assessment_questions", () => {
  it("creates, then diffs by id: keeps, reorders, edits and deletes", async () => {
    const { assessmentId } = await createQuiz("Quiz diff")
    const first = await professor.client.rpc("save_assessment_questions", {
      p_assessment: assessmentId,
      p_questions: [mc("Pregunta A"), mc("Pregunta B"), { type: "OPEN_ENDED", prompt: "C abierta", points: 2 }],
    })
    expect(first.error).toBeNull()
    const [idA, , idC] = first.data!

    const second = await professor.client.rpc("save_assessment_questions", {
      p_assessment: assessmentId,
      p_questions: [{ id: idC, type: "OPEN_ENDED", prompt: "C editada", points: 3 }, mc("A editada", { id: idA })],
      p_random_count: 1,
    })
    expect(second.error).toBeNull()
    expect(second.data).toEqual([idC, idA])

    const rows = await questionsOf(assessmentId)
    expect(rows.map((r) => [r.id, r.prompt, r.position])).toEqual([
      [idC, "C editada", 1],
      [idA, "A editada", 2],
    ])
    const { data: assessment } = await supabaseAdmin.from("assessments").select("random_question_count").eq("id", assessmentId).single()
    expect(assessment?.random_question_count).toBe(1)
  })

  it("validates MC shape, random bounds, foreign ids and TASK", async () => {
    const { assessmentId } = await createQuiz("Quiz validaciones")
    const save = (questions: unknown[], random?: number) =>
      professor.client.rpc("save_assessment_questions", { p_assessment: assessmentId, p_questions: questions as never, p_random_count: random })

    expect((await save([mc("Sin correcta", { options: [{ label: "a", isCorrect: false }, { label: "b", isCorrect: false }] })])).error?.code).toBe("22023")
    expect((await save([mc("Una opción", { options: [{ label: "a", isCorrect: true }] })])).error?.code).toBe("22023")
    expect((await save([mc("Pregunta Q")], 2)).error?.code).toBe("22023")
    expect((await save([mc("Id ajeno", { id: randomUUID() })])).error?.code).toBe("22023")

    const task = await professor.client.rpc("create_assessment_block", {
      p_lesson: course.modules[0]!.lessonId,
      p_kind: "TASK",
      p_is_required: false,
      p_config: { title: "Tarea", passingScore: 60, maxFiles: 1, availableUntil: new Date(Date.now() + 86_400_000).toISOString() },
    })
    expect(task.error).toBeNull()
    const taskSave = await professor.client.rpc("save_assessment_questions", {
      p_assessment: (task.data as { assessmentId: string }).assessmentId,
      p_questions: [mc("No va")],
    })
    expect(taskSave.error?.message).toContain("TASK_HAS_NO_QUESTIONS")
  })

  it("is refused to a professor of another edition, and students read neither questions nor options", async () => {
    const { assessmentId } = await createQuiz("Quiz privado")
    await professor.client.rpc("save_assessment_questions", { p_assessment: assessmentId, p_questions: [mc("Secreta")] })

    const foreign = await outsider.client.rpc("save_assessment_questions", { p_assessment: assessmentId, p_questions: [] })
    expect(foreign.error?.code).toBe("42501")

    const student = await member("inline-student-read", ORG_A, "STUDENT")
    await enrollStudent(course, ORG_A, student.id)
    expect((await student.client.from("questions").select("id").eq("assessment_id", assessmentId)).data).toEqual([])
    expect((await student.client.from("question_options").select("id, is_correct")).data).toEqual([])
  })
})

describe("attempts over inline questions", () => {
  async function publishedQuiz(title: string, prompts: string[], random?: number) {
    const { blockId, assessmentId } = await createQuiz(title)
    const saved = await professor.client.rpc("save_assessment_questions", {
      p_assessment: assessmentId,
      p_questions: prompts.map((p) => mc(p)),
      p_random_count: random,
    })
    expect(saved.error).toBeNull()
    await supabaseAdmin.from("assessments").update({ status: "PUBLISHED" }).eq("id", assessmentId)
    return { blockId, assessmentId }
  }

  it("snapshots every question by position, or a distinct random N", async () => {
    const all = await publishedQuiz("Quiz completo", ["P1", "P2", "P3"])
    const sampled = await publishedQuiz("Quiz al azar", ["R1", "R2", "R3", "R4"], 2)
    const student = await member("inline-student-attempt", ORG_A, "STUDENT")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const fullAttempt = await student.client.rpc("start_attempt", { p_enrollment: enrollmentId, p_assessment: all.assessmentId })
    const { data: fullSnap } = await supabaseAdmin.from("assessment_attempt_questions").select("prompt").eq("attempt_id", fullAttempt.data!).order("position")
    expect(fullSnap?.map((q) => q.prompt)).toEqual(["P1", "P2", "P3"])

    const randomAttempt = await student.client.rpc("start_attempt", { p_enrollment: enrollmentId, p_assessment: sampled.assessmentId })
    const { data: randomSnap } = await supabaseAdmin.from("assessment_attempt_questions").select("prompt, question_id").eq("attempt_id", randomAttempt.data!)
    expect(randomSnap).toHaveLength(2)
    expect(new Set(randomSnap!.map((q) => q.question_id)).size).toBe(2)
  })

  it("deleting a question mid-attempt keeps the snapshot gradable; the block then cannot be deleted", async () => {
    const { blockId, assessmentId } = await publishedQuiz("Quiz editado en vivo", ["Única"])
    const student = await member("inline-student-delete", ORG_A, "STUDENT")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { data: attemptId } = await student.client.rpc("start_attempt", { p_enrollment: enrollmentId, p_assessment: assessmentId })

    // The professor rewrites the quiz: the original question is gone.
    await professor.client.rpc("save_assessment_questions", { p_assessment: assessmentId, p_questions: [mc("Reemplazo")] })

    const { data: snap } = await supabaseAdmin.from("assessment_attempt_questions").select("id, prompt, question_id, options").eq("attempt_id", attemptId!).single()
    expect(snap?.prompt).toBe("Única")
    expect(snap?.question_id).toBeNull()
    const correct = (snap!.options as { id: string; label: string }[]).find((o) => o.label === "Correcta")!

    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attemptId!, p_session: session })
    const submitted = await student.client.rpc("submit_attempt", {
      p_attempt: attemptId!,
      p_session: session,
      p_answers: [{ attempt_question_id: snap!.id, selected_option_id: correct.id, client_seq: 1 }],
    })
    expect(submitted.error).toBeNull()
    expect(Number(submitted.data![0]!.score_percent)).toBe(100)

    const removal = await professor.client.rpc("delete_content_block", { p_block: blockId })
    expect(removal.error?.message).toContain("CONFLICT_HAS_ATTEMPTS")
  })

  it("deleting a block without attempts removes its assessment and questions", async () => {
    const { blockId, assessmentId } = await publishedQuiz("Quiz descartable", ["Pregunta X"])
    const removal = await professor.client.rpc("delete_content_block", { p_block: blockId })
    expect(removal.error).toBeNull()
    const { count } = await supabaseAdmin.from("assessments").select("id", { count: "exact", head: true }).eq("id", assessmentId)
    expect(count).toBe(0)
    expect(await questionsOf(assessmentId)).toEqual([])
  })
})

describe("lifecycle guards", () => {
  it("a published quiz cannot be emptied", async () => {
    const { assessmentId } = await createQuiz("Quiz publicado no vaciable")
    await professor.client.rpc("save_assessment_questions", { p_assessment: assessmentId, p_questions: [mc("Pregunta fija")] })
    await supabaseAdmin.from("assessments").update({ status: "PUBLISHED" }).eq("id", assessmentId)
    const emptied = await professor.client.rpc("save_assessment_questions", { p_assessment: assessmentId, p_questions: [] })
    expect(emptied.error?.code).toBe("22023")
    expect(await questionsOf(assessmentId)).toHaveLength(1)
  })

  it("a quiz that gates a module cannot be deleted with its block or lesson", async () => {
    const gated = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso con requisito",
      modules: [
        { title: "Módulo 1", requiredBlocks: 1 },
        { title: "Módulo 2", requiredBlocks: 1 },
      ],
    })
    courseIds.push(gated.courseId)
    await assignOfferingProfessor(gated.offeringId, professor.id)
    const created = await professor.client.rpc("create_assessment_block", {
      p_lesson: gated.modules[0]!.lessonId,
      p_kind: "QUIZ",
      p_is_required: false,
      p_config: { title: "Quiz requisito", passingScore: 60 },
    })
    const { blockId, assessmentId } = created.data as { blockId: string; assessmentId: string }
    const { data: assessment } = await supabaseAdmin.from("assessments").select("module_id").eq("id", assessmentId).single()
    expect(assessment?.module_id).toBe(gated.modules[0]!.id)

    await supabaseAdmin.from("module_dependencies").insert({
      module_id: gated.modules[1]!.id, condition: "QUIZ_PASSED", assessment_id: assessmentId, min_score: 50,
    })

    const block = await professor.client.rpc("delete_content_block", { p_block: blockId })
    expect(block.error?.message).toContain("CONFLICT_HAS_DEPENDENCIES")
    const lesson = await professor.client.rpc("delete_lesson", { p_lesson: gated.modules[0]!.lessonId })
    expect(lesson.error?.message).toContain("CONFLICT_HAS_DEPENDENCIES")

    // Once the dependency is gone, deleting the lesson takes the quiz with it.
    await supabaseAdmin.from("module_dependencies").delete().eq("assessment_id", assessmentId)
    expect((await professor.client.rpc("delete_lesson", { p_lesson: gated.modules[0]!.lessonId })).error).toBeNull()
    const { count } = await supabaseAdmin.from("assessments").select("id", { count: "exact", head: true }).eq("id", assessmentId)
    expect(count).toBe(0)
  })
})

describe("copy_edition_content", () => {
  it("deep-copies questions: editing the copy never touches the source", async () => {
    const source = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso origen inline",
      modules: [{ title: "Módulo", requiredBlocks: 1 }],
    })
    courseIds.push(source.courseId)
    await assignOfferingProfessor(source.offeringId, professor.id)
    const created = await professor.client.rpc("create_assessment_block", {
      p_lesson: source.modules[0]!.lessonId,
      p_kind: "QUIZ",
      p_is_required: false,
      p_config: { title: "Quiz a copiar", passingScore: 60 },
    })
    const sourceAssessment = (created.data as { assessmentId: string }).assessmentId
    await professor.client.rpc("save_assessment_questions", { p_assessment: sourceAssessment, p_questions: [mc("Original")] })

    const group = await supabaseAdmin.from("groups").insert({ organization_id: ORG_A, name: `G inline ${Date.now()}` }).select("id").single()
    groupIds.push(group.data!.id)
    const { data: target } = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: source.courseId, organization_id: ORG_A, kind: "GROUP", group_id: group.data!.id, name: "Copia" })
      .select("id")
      .single()
    expect((await supabaseAdmin.rpc("copy_edition_content", { p_source: source.offeringId, p_target: target!.id })).error).toBeNull()

    const { data: copy } = await supabaseAdmin.from("assessments").select("id").eq("offering_id", target!.id).single()
    const copied = await questionsOf(copy!.id)
    const original = await questionsOf(sourceAssessment)
    expect(copied).toHaveLength(1)
    expect(copied[0]!.id).not.toBe(original[0]!.id)
    expect(copied[0]!.question_options).toHaveLength(2)

    await supabaseAdmin.from("questions").update({ prompt: "Editada en la copia" }).eq("id", copied[0]!.id)
    expect((await questionsOf(sourceAssessment))[0]!.prompt).toBe("Original")
  })
})
