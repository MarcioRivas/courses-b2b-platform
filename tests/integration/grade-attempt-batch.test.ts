import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  assignOfferingProfessor,
  cleanupFixtures,
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
} from "../helpers/course-fixtures"
import { submitOpenAttempt } from "../helpers/attempt-submission"

/**
 * grade_attempt_batch (unified "Guardar" of the grading screen): N open-answer
 * grades + the overall feedback in one transaction, then recompute_attempt_score.
 * Scale of ORG_A: 0-69 "No aprobado" (not passing), 70+ passing.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })
})

interface Setup {
  professor: Awaited<ReturnType<typeof member>>
  student: Awaited<ReturnType<typeof member>>
  enrollmentId: string
  assessmentId: string
}

/** One edition with a professor, a student, and a PUBLISHED EXAM (`multipleChoice` MC + `openEnded` open questions, 1 pt each). */
async function setup(label: string, openEnded: number, multipleChoice = 1): Promise<Setup> {
  const professor = await member(`batch-${label}-prof`, ORG_A, "PROFESSOR")
  const student = await member(`batch-${label}-student`, ORG_A, "STUDENT")
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso lote ${label}`,
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)
  await assignOfferingProfessor(course.offeringId, professor.id)

  const fixture = await makeAssessmentFixture({
    offeringId: course.offeringId,
    organizationId: ORG_A,
    title: `Examen lote ${label}`,
    kind: "EXAM",
    multipleChoice,
    openEnded,
    durationSeconds: 3600,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 3600000).toISOString(),
  })

  const enrollmentId = await enrollStudent(course, ORG_A, student.id)
  return { professor, student, enrollmentId, assessmentId: fixture.assessmentId }
}

function openIds(questions: { id: string; type: string }[]): string[] {
  return questions.filter((q) => q.type === "OPEN_ENDED").map((q) => q.id)
}

/** The two open questions of a two-open-question attempt. */
function openPair(questions: { id: string; type: string }[]): [string, string] {
  const ids = openIds(questions)
  if (ids.length !== 2) throw new Error(`expected 2 open questions, got ${ids.length}`)
  return [ids[0]!, ids[1]!]
}

/** First open question of an attempt; fails the test if there is none. */
function firstOpenId(questions: { id: string; type: string }[]): string {
  const [id] = openIds(questions)
  if (!id) throw new Error("attempt has no open question")
  return id
}

describe("grade_attempt_batch: happy path", () => {
  it("grading every open answer flips the attempt to GRADED with the scale-derived label and pass flag", async () => {
    const s = await setup("all", 2)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const [q1, q2] = openPair(questions)

    const { data, error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [
        { attempt_question_id: q1, points: 1, feedback: "Muy bien." },
        { attempt_question_id: q2, points: 0, feedback: null },
      ],
      p_feedback: "Buen intento general.",
    })

    expect(error).toBeNull()
    const row = data![0]!
    expect(row.status).toBe("GRADED")
    expect(row.ungraded_count).toBe(0)
    expect(Number(row.total_score)).toBe(1)
    expect(Number(row.max_score)).toBe(3)
    // 1 / 3 = 33.33% -> below the 70 threshold: "No aprobado", not passed.
    expect(Number(row.score_percent)).toBe(33.33)
    expect(row.score_label).toBe("No aprobado")
    expect(row.passed).toBe(false)

    // assessment_grades also holds the MC auto-grade row, so scope to the open questions.
    const { data: grades } = await supabaseAdmin
      .from("assessment_grades")
      .select("attempt_question_id, points_awarded, feedback")
      .eq("attempt_id", attemptId)
      .in("attempt_question_id", [q1, q2])
    expect(grades).toHaveLength(2)
    expect(grades!.find((g) => g.attempt_question_id === q1)!.feedback).toBe("Muy bien.")
    expect(grades!.find((g) => g.attempt_question_id === q2)!.feedback).toBeNull()

    const { data: feedback } = await supabaseAdmin
      .from("assessment_feedback")
      .select("feedback")
      .eq("attempt_id", attemptId)
      .single()
    expect(feedback!.feedback).toBe("Buen intento general.")
  })

  it("full marks on the only question yields 100%, the top label, and passed = true", async () => {
    const s = await setup("pass", 1, 0)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const q1 = firstOpenId(questions)

    const { data, error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [{ attempt_question_id: q1, points: 1, feedback: "Perfecto." }],
      p_feedback: "Excelente.",
    })
    expect(error).toBeNull()
    const row = data![0]!
    expect(row.status).toBe("GRADED")
    expect(Number(row.score_percent)).toBe(100)
    expect(row.score_label).toBe("Excelente")
    expect(row.passed).toBe(true)
  })

  it("the scale boundary 70% is passing and 69% is not", async () => {
    const s = await setup("boundary", 10, 0)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const ids = openIds(questions)

    // 7 of 10 points = 70% exactly: "Bueno", passing.
    const { data: at70, error: error70 } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: ids.map((id, i) => ({ attempt_question_id: id, points: i < 7 ? 1 : 0, feedback: null })),
      p_feedback: "Setenta.",
    })
    expect(error70).toBeNull()
    expect(Number(at70![0]!.score_percent)).toBe(70)
    expect(at70![0]!.score_label).toBe("Bueno")
    expect(at70![0]!.passed).toBe(true)

    // Re-grade 6 of 10 = 60%: not passing.
    const { data: at60, error: error60 } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: ids.map((id, i) => ({ attempt_question_id: id, points: i < 6 ? 1 : 0, feedback: null })),
      p_feedback: "Sesenta.",
    })
    expect(error60).toBeNull()
    expect(Number(at60![0]!.score_percent)).toBe(60)
    expect(at60![0]!.score_label).toBe("No aprobado")
    expect(at60![0]!.passed).toBe(false)
  })

  it("re-saving the same attempt overwrites earlier grades instead of duplicating them", async () => {
    const s = await setup("resave", 1)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const q1 = firstOpenId(questions)

    await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [{ attempt_question_id: q1, points: 0, feedback: "Primera versión." }],
      p_feedback: "Primer comentario.",
    })
    const { data, error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [{ attempt_question_id: q1, points: 1, feedback: "Versión final." }],
      p_feedback: "Comentario final.",
    })
    expect(error).toBeNull()
    expect(Number(data![0]!.total_score)).toBe(1)

    const { data: grades } = await supabaseAdmin
      .from("assessment_grades")
      .select("points_awarded, feedback")
      .eq("attempt_id", attemptId)
      .eq("attempt_question_id", q1)
    expect(grades).toHaveLength(1)
    expect(Number(grades![0]!.points_awarded)).toBe(1)
    expect(grades![0]!.feedback).toBe("Versión final.")

    const { data: feedback } = await supabaseAdmin
      .from("assessment_feedback")
      .select("feedback")
      .eq("attempt_id", attemptId)
    expect(feedback).toHaveLength(1)
    expect(feedback![0]!.feedback).toBe("Comentario final.")
  })

  it("writes exactly one audit row per save", async () => {
    const s = await setup("audit", 2)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const [q1, q2] = openPair(questions)

    const { error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [
        { attempt_question_id: q1, points: 1, feedback: null },
        { attempt_question_id: q2, points: 1, feedback: null },
      ],
      p_feedback: "Auditoría.",
    })
    expect(error).toBeNull()

    const { data: logs } = await supabaseAdmin
      .from("audit_logs")
      .select("action, metadata")
      .eq("entity_id", attemptId)
      .eq("action", "attempt.graded_batch")
    expect(logs).toHaveLength(1)
    expect((logs![0]!.metadata as { graded_count: number }).graded_count).toBe(2)
  })
})

describe("grade_attempt_batch: partial saves", () => {
  it("grading only some open answers keeps the attempt SUBMITTED and reports the remaining ungraded count", async () => {
    const s = await setup("partial", 2)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const q1 = firstOpenId(questions)

    const { data, error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [{ attempt_question_id: q1, points: 1, feedback: null }],
      p_feedback: "Falta una respuesta.",
    })
    expect(error).toBeNull()
    const row = data![0]!
    expect(row.status).toBe("SUBMITTED")
    expect(row.ungraded_count).toBe(1)

    // Not graded yet: the student still cannot see a result.
    const { data: attempt } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status, graded_at")
      .eq("id", attemptId)
      .single()
    expect(attempt!.status).toBe("SUBMITTED")
    expect(attempt!.graded_at).toBeNull()
  })
})

describe("grade_attempt_batch: validation is all-or-nothing", () => {
  it("a points value above the question maximum rejects the whole batch and saves nothing", async () => {
    const s = await setup("overmax", 2)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const [q1, q2] = openPair(questions)

    const { error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [
        { attempt_question_id: q1, points: 1, feedback: "válida" },
        { attempt_question_id: q2, points: 5, feedback: "fuera de rango" },
      ],
      p_feedback: "Comentario.",
    })
    expect(error?.message).toContain("INVALID_ANSWER")

    const { count } = await supabaseAdmin
      .from("assessment_grades")
      .select("id", { count: "exact", head: true })
      .eq("attempt_id", attemptId)
      .in("attempt_question_id", [q1, q2])
    expect(count).toBe(0)

    const { data: attempt } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status")
      .eq("id", attemptId)
      .single()
    expect(attempt!.status).toBe("SUBMITTED")
  })

  it("a negative points value is refused", async () => {
    const s = await setup("negative", 1)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const q1 = firstOpenId(questions)

    const { error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [{ attempt_question_id: q1, points: -0.5, feedback: null }],
      p_feedback: "Comentario.",
    })
    expect(error?.message).toContain("INVALID_ANSWER")
  })

  it("a question id from another attempt is refused", async () => {
    const s = await setup("foreign", 1)
    const first = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const second = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const foreignQuestion = openIds(second.questions)[0]!

    const { error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: first.attemptId,
      p_grades: [{ attempt_question_id: foreignQuestion, points: 1, feedback: null }],
      p_feedback: "Cruzado.",
    })
    expect(error?.message).toContain("INVALID_ANSWER")
  })

  it("the multiple-choice question is not gradable through the batch", async () => {
    const s = await setup("mcblock", 1)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const mc = questions.find((q) => q.type === "MULTIPLE_CHOICE")!

    const { error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: [{ attempt_question_id: mc.id, points: 1, feedback: null }],
      p_feedback: "MC.",
    })
    expect(error?.message).toContain("INVALID_ANSWER")
  })

  it("empty or whitespace-only overall feedback is refused", async () => {
    const s = await setup("nofeedback", 1)
    const { attemptId, questions } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)
    const q1 = firstOpenId(questions)

    for (const feedback of ["", "   "]) {
      const { error } = await s.professor.client.rpc("grade_attempt_batch", {
        p_attempt: attemptId,
        p_grades: [{ attempt_question_id: q1, points: 1, feedback: null }],
        p_feedback: feedback,
      })
      expect(error?.message).toContain("INVALID_ANSWER")
    }
  })

  it("a non-array grades payload is refused", async () => {
    const s = await setup("nonarray", 1)
    const { attemptId } = await submitOpenAttempt(s.student, s.enrollmentId, s.assessmentId)

    const { error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId,
      p_grades: { attempt_question_id: null } as unknown as [],
      p_feedback: "Comentario.",
    })
    expect(error?.message).toContain("INVALID_ANSWER")
  })

  it("an attempt still IN_PROGRESS cannot be graded", async () => {
    const s = await setup("inprogress", 1)
    const { data: attemptId, error: startError } = await s.student.client.rpc("start_attempt", {
      p_enrollment: s.enrollmentId,
      p_assessment: s.assessmentId,
    })
    expect(startError).toBeNull()
    const { data: questions } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id")
      .eq("attempt_id", attemptId!)
      .eq("type", "OPEN_ENDED")

    const { error } = await s.professor.client.rpc("grade_attempt_batch", {
      p_attempt: attemptId!,
      p_grades: [{ attempt_question_id: questions![0]!.id, points: 1, feedback: null }],
      p_feedback: "Prematuro.",
    })
    expect(error?.message).toContain("ATTEMPT_IN_PROGRESS")
  })
})
