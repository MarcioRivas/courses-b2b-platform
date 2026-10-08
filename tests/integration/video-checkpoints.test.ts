import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { cleanupFixtures, enrollStudent, makeCourseFixture } from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"

/**
 * In-video checkpoint quizzes: authoring (validation, id-preserving upsert),
 * the student read path (no answer key), answering (min correct, order, log),
 * the completion guard and the professor statistics.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
})

interface Setup {
  professor: TestUser
  student: TestUser
  courseId: string
  lessonId: string
  blockId: string
  enrollmentId: string
}

async function setup(label: string): Promise<Setup> {
  const professor = await member(`${label}-prof`, ORG_A, "PROFESSOR")
  const student = await member(`${label}-student`, ORG_A, "STUDENT")
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso video ${label}`,
    modules: [{ title: "Módulo", requiredBlocks: 0 }],
  })
  courseIds.push(course.courseId)
  await supabaseAdmin.from("course_professors").insert({ course_id: course.courseId, user_id: professor.id })

  const lessonId = course.modules[0]!.lessonId
  const { data: block } = await supabaseAdmin
    .from("lesson_content_blocks")
    .insert({ lesson_id: lessonId, type: "YOUTUBE_VIDEO", position: 1, data: { videoId: "dQw4w9WgXcQ" }, is_required: true })
    .select("id")
    .single()
  const enrollmentId = await enrollStudent(course, ORG_A, student.id)
  return { professor, student, courseId: course.courseId, lessonId, blockId: block!.id, enrollmentId }
}

/** Two checkpoints: 0:30 (2 questions, need 1) and 1:15 (1 question, need 1). Correct option is always "Sí". */
function draft() {
  return [
    {
      atSeconds: 30,
      minCorrect: 1,
      questions: [
        { prompt: "¿Pregunta A?", options: [{ label: "Sí", isCorrect: true }, { label: "No", isCorrect: false }] },
        { prompt: "¿Pregunta B?", options: [{ label: "Sí", isCorrect: true }, { label: "No", isCorrect: false }, { label: "Tal vez", isCorrect: false }] },
      ],
    },
    {
      atSeconds: 75,
      minCorrect: 1,
      questions: [{ prompt: "¿Pregunta C?", options: [{ label: "Sí", isCorrect: true }, { label: "No", isCorrect: false }] }],
    },
  ]
}

async function save(s: Setup, checkpoints: unknown) {
  return s.professor.client.rpc("save_video_checkpoints", { p_block: s.blockId, p_checkpoints: checkpoints as never })
}

interface StudentCheckpoint {
  id: string
  atSeconds: number
  passed: boolean
  questions: { id: string; prompt: string; options: { id: string; label: string }[] }[]
}

async function studentView(s: Setup): Promise<StudentCheckpoint[]> {
  const { data, error } = await s.student.client.rpc("video_checkpoints_for_lesson", {
    p_enrollment: s.enrollmentId,
    p_lesson: s.lessonId,
  })
  if (error) throw error
  return ((data as unknown as Record<string, StudentCheckpoint[]>) ?? {})[s.blockId] ?? []
}

function answersFor(cp: StudentCheckpoint, pick: "Sí" | "No") {
  return cp.questions.map((q) => ({ questionId: q.id, optionId: q.options.find((o) => o.label === pick)!.id }))
}

function answer(s: Setup, cp: StudentCheckpoint, answers: unknown) {
  return s.student.client.rpc("answer_video_checkpoint", {
    p_enrollment: s.enrollmentId,
    p_checkpoint: cp.id,
    p_answers: answers as never,
  })
}

describe("save_video_checkpoints", () => {
  it("saves a valid set and rejects invalid ones", async () => {
    const s = await setup("save")
    expect((await save(s, draft())).error).toBeNull()

    const twoCorrect = draft()
    twoCorrect[1]!.questions[0]!.options[1]!.isCorrect = true
    expect((await save(s, twoCorrect)).error?.message).toContain("INVALID_CHECKPOINTS")

    const minTooHigh = draft()
    minTooHigh[1]!.minCorrect = 2
    expect((await save(s, minTooHigh)).error?.message).toContain("INVALID_CHECKPOINTS")

    const sameTime = draft()
    sameTime[1]!.atSeconds = 30
    expect((await save(s, sameTime)).error?.message).toContain("INVALID_CHECKPOINTS")

    // A duplicated id would merge two options and could drop the correct one.
    const { data: saved } = await s.professor.client
      .from("video_checkpoints")
      .select("id, video_checkpoint_questions(id, video_checkpoint_options(id, is_correct))")
      .eq("block_id", s.blockId)
      .order("at_seconds")
    const question = saved![1]!.video_checkpoint_questions[0]!
    const [correct, wrong] = [...question.video_checkpoint_options].sort((a, b) => Number(b.is_correct) - Number(a.is_correct))
    const duplicated = [
      {
        id: saved![1]!.id,
        atSeconds: 75,
        minCorrect: 1,
        questions: [
          {
            id: question.id,
            prompt: "¿Pregunta C?",
            options: [
              { id: correct!.id, label: "Sí", isCorrect: true },
              { id: correct!.id, label: "No", isCorrect: false },
            ],
          },
        ],
      },
    ]
    expect(wrong).toBeDefined()
    expect((await save(s, duplicated)).error?.message).toContain("INVALID_CHECKPOINTS")
  })

  it("refuses a professor of another course", async () => {
    const s = await setup("save-deny")
    const stranger = await member("save-stranger", ORG_A, "PROFESSOR")
    const { error } = await stranger.client.rpc("save_video_checkpoints", { p_block: s.blockId, p_checkpoints: draft() as never })
    expect(error?.code).toBe("42501")
  })

  it("keeps ids (and progress) for kept items and drops removed ones", async () => {
    const s = await setup("upsert")
    await save(s, draft())
    const { data: editor } = await s.professor.client
      .from("video_checkpoints")
      .select("id, at_seconds, video_checkpoint_questions(id, prompt, position, video_checkpoint_options(id, label, is_correct, position))")
      .eq("block_id", s.blockId)
      .order("at_seconds")
    const [first, second] = editor!

    const [cp1] = await studentView(s)
    await answer(s, cp1!, answersFor(cp1!, "Sí"))

    // Keep checkpoint 1 (edit a prompt), drop checkpoint 2.
    const q = [...first!.video_checkpoint_questions].sort((a, b) => a.position - b.position)
    const kept = [
      {
        id: first!.id,
        atSeconds: 40,
        minCorrect: 1,
        questions: q.map((question) => ({
          id: question.id,
          prompt: `${question.prompt} (editada)`,
          options: [...question.video_checkpoint_options]
            .sort((a, b) => a.position - b.position)
            .map((o) => ({ id: o.id, label: o.label, isCorrect: o.is_correct })),
        })),
      },
    ]
    expect((await save(s, kept)).error).toBeNull()

    const { count: progress } = await supabaseAdmin
      .from("video_checkpoint_progress")
      .select("checkpoint_id", { count: "exact", head: true })
      .eq("checkpoint_id", first!.id)
      .not("passed_at", "is", null)
    expect(progress).toBe(1)

    const { count: removed } = await supabaseAdmin
      .from("video_checkpoints")
      .select("id", { count: "exact", head: true })
      .eq("id", second!.id)
    expect(removed).toBe(0)
  })
})

describe("student read and answers", () => {
  it("never exposes the answer key and enforces order, minimum and logging", async () => {
    const s = await setup("answer")
    await save(s, draft())

    const { data: raw } = await s.student.client.rpc("video_checkpoints_for_lesson", {
      p_enrollment: s.enrollmentId,
      p_lesson: s.lessonId,
    })
    expect(JSON.stringify(raw)).not.toMatch(/is_?correct/i)

    const [cp1, cp2] = await studentView(s)
    expect((await answer(s, cp2!, answersFor(cp2!, "Sí"))).error?.message).toContain("CHECKPOINT_ORDER")

    const fail = await answer(s, cp1!, answersFor(cp1!, "No"))
    expect(fail.data?.[0]).toMatchObject({ passed: false, correct: 0, total: 2, min_correct: 1 })

    // One right, one unanswered: 1 >= min 1, passes.
    const partial = await answer(s, cp1!, [answersFor(cp1!, "Sí")[0]])
    expect(partial.data?.[0]).toMatchObject({ passed: true, correct: 1, total: 2 })

    const { data: attempts } = await supabaseAdmin
      .from("video_checkpoint_attempts")
      .select("attempt_number, passed")
      .eq("checkpoint_id", cp1!.id)
      .order("attempt_number")
    expect(attempts).toEqual([
      { attempt_number: 1, passed: false },
      { attempt_number: 2, passed: true },
    ])

    // Re-answering after passing is a no-op (not logged).
    await answer(s, cp1!, answersFor(cp1!, "No"))
    const { count } = await supabaseAdmin
      .from("video_checkpoint_attempts")
      .select("id", { count: "exact", head: true })
      .eq("checkpoint_id", cp1!.id)
    expect(count).toBe(2)

    const foreignOption = [{ questionId: cp1!.questions[0]!.id, optionId: cp1!.questions[1]!.options[0]!.id }]
    expect((await answer(s, cp2!, foreignOption)).error?.message).toContain("INVALID_ANSWER")
  })

  it("refuses another student's enrollment and gives students no table access", async () => {
    const s = await setup("isolation")
    await save(s, draft())
    const intruder = await member("intruder", ORG_A, "STUDENT")
    const { error } = await intruder.client.rpc("video_checkpoints_for_lesson", {
      p_enrollment: s.enrollmentId,
      p_lesson: s.lessonId,
    })
    expect(error?.code).toBe("42501")

    for (const table of ["video_checkpoints", "video_checkpoint_questions", "video_checkpoint_options"] as const) {
      const { data } = await s.student.client.from(table).select("id")
      expect(data ?? []).toEqual([])
    }
    const { error: progressError } = await s.student.client.from("video_checkpoint_progress").select("passed_at")
    expect(progressError).not.toBeNull()
  })
})

describe("completion guard", () => {
  it("refuses completing a video with pending checkpoints and allows it once all are passed", async () => {
    const s = await setup("guard")
    await save(s, draft())
    const complete = () =>
      s.student.client.rpc("complete_content_block", { p_enrollment: s.enrollmentId, p_block: s.blockId, p_completed: true })

    expect((await complete()).error?.message).toContain("CHECKPOINTS_PENDING")

    const [cp1, cp2] = await studentView(s)
    await answer(s, cp1!, answersFor(cp1!, "Sí"))
    await answer(s, cp2!, answersFor(cp2!, "Sí"))
    expect((await complete()).error).toBeNull()
  })

  it("keeps an earlier completion valid when checkpoints are added later", async () => {
    const s = await setup("added-later")
    const complete = () =>
      s.student.client.rpc("complete_content_block", { p_enrollment: s.enrollmentId, p_block: s.blockId, p_completed: true })
    expect((await complete()).error).toBeNull()
    await save(s, draft())
    // Re-completing is a no-op, not a CHECKPOINTS_PENDING error.
    expect((await complete()).error).toBeNull()
  })

  it("leaves videos without checkpoints unaffected", async () => {
    const s = await setup("plain")
    const { error } = await s.student.client.rpc("complete_content_block", {
      p_enrollment: s.enrollmentId,
      p_block: s.blockId,
      p_completed: true,
    })
    expect(error).toBeNull()
  })
})

describe("video_checkpoint_stats", () => {
  it("aggregates reach, pass rates and wrong answers per question and option", async () => {
    const s = await setup("stats")
    await save(s, draft())
    const [cp1] = await studentView(s)
    await answer(s, cp1!, answersFor(cp1!, "No"))
    await answer(s, cp1!, answersFor(cp1!, "Sí"))

    const { data, error } = await s.professor.client.rpc("video_checkpoint_stats", { p_block: s.blockId })
    expect(error).toBeNull()
    const stats = data as {
      enrolledCount: number
      checkpoints: {
        reached: number
        passed: number
        totalAttempts: number
        failedAttempts: number
        firstTryAttempts: number
        firstTryPassed: number
        avgAttemptsToPass: number | null
        questions: { answers: number; wrong: number; options: { label: string; chosen: number }[] }[]
      }[]
    }
    expect(stats.enrolledCount).toBe(1)
    expect(stats.checkpoints[0]).toMatchObject({
      reached: 1,
      passed: 1,
      totalAttempts: 2,
      failedAttempts: 1,
      firstTryAttempts: 1,
      firstTryPassed: 0,
      avgAttemptsToPass: 2,
    })
    expect(stats.checkpoints[0]!.questions[0]).toMatchObject({ answers: 2, wrong: 1 })
    expect(stats.checkpoints[0]!.questions[0]!.options.find((o) => o.label === "No")?.chosen).toBe(1)
    expect(stats.checkpoints[1]).toMatchObject({ reached: 0, passed: 0 })

    const { error: denied } = await s.student.client.rpc("video_checkpoint_stats", { p_block: s.blockId })
    expect(denied?.code).toBe("42501")
  })
})
