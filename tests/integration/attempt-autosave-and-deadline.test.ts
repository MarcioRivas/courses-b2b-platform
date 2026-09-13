import { afterAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  cleanupFixtures,
} from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"

/**
 * The resilience contract (D1/D4/D30): saves near the deadline, out-of-order
 * retries, session takeover, and auto-submit. These are the cases a student on
 * a phone with bad signal actually hits.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })

})

interface Attempt {
  attemptId: string
  questionIds: string[]
  optionsByQuestion: Map<string, { id: string; label: string }[]>
  /**
   * The genuinely correct option per snapshot question, resolved with the
   * service role. Options are SHUFFLED into the snapshot, so "index 0" is not
   * the correct answer — assuming it was made an earlier version of this suite
   * pass or fail at random.
   */
  correctByQuestion: Map<string, string | null>
}

async function startAttempt(
  student: TestUser,
  title: string,
  options: { durationSeconds?: number | null; openEnded?: number; multipleChoice?: number } = {}
): Promise<Attempt> {
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)

  const fixture = await makeAssessmentFixture({
    courseId: course.courseId,
    organizationId: ORG_A,
    title: `${title} — evaluación`,
    kind: "QUIZ",
    multipleChoice: options.multipleChoice ?? 2,
    openEnded: options.openEnded ?? 0,
    durationSeconds: options.durationSeconds ?? null,
  })
  bankIds.push(fixture.bankId)

  const enrollmentId = await enrollStudent(course, ORG_A, student.id)
  const { data: attemptId, error } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: fixture.assessmentId,
  })
  if (error || !attemptId) throw error ?? new Error("attempt not started")

  const { data: rows } = await supabaseAdmin
    .from("assessment_attempt_questions")
    .select("id, question_id, options")
    .eq("attempt_id", attemptId)
    .order("position")

  const optionsByQuestion = new Map<string, { id: string; label: string }[]>()
  const correctByQuestion = new Map<string, string | null>()
  for (const row of rows ?? []) {
    optionsByQuestion.set(row.id, row.options as { id: string; label: string }[])
    correctByQuestion.set(
      row.id,
      fixture.questions.find((q) => q.questionId === row.question_id)?.correctOptionId ?? null
    )
  }

  return {
    attemptId,
    questionIds: (rows ?? []).map((r) => r.id),
    optionsByQuestion,
    correctByQuestion,
  }
}

/** Pushes the attempt's deadline to a chosen offset from now, in seconds. */
async function setDeadline(attemptId: string, secondsFromNow: number): Promise<void> {
  await supabaseAdmin
    .from("assessment_attempts")
    .update({ effective_end_at: new Date(Date.now() + secondsFromNow * 1000).toISOString() })
    .eq("id", attemptId)
}

describe("save_answers_batch: ordering (D4/D30)", () => {
  it("ignores a late retry carrying a lower client_seq", async () => {
    const student = await member("save-ordering", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso orden")
    const session = randomUUID()
    const questionId = attempt.questionIds[0]!
    const [optionA, optionB] = attempt.optionsByQuestion.get(questionId)!

    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: session })

    const newer = await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: session,
      p_answers: [{ attempt_question_id: questionId, selected_option_id: optionB!.id, client_seq: 5 }],
    })
    expect(newer.error).toBeNull()

    // A duplicate packet from before, arriving late.
    const stale = await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: session,
      p_answers: [{ attempt_question_id: questionId, selected_option_id: optionA!.id, client_seq: 2 }],
    })
    expect(stale.error).toBeNull()
    // Nothing was applied, so nothing is reported accepted — this is what the
    // client reconciles its dirty map against.
    expect(stale.data![0]!.accepted).toEqual([])

    const { data } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("selected_option_id, client_seq")
      .eq("id", questionId)
      .single()
    expect(data!.selected_option_id).toBe(optionB!.id)
    expect(data!.client_seq).toBe(5)
  })

  it("reports exactly which answers were accepted", async () => {
    const student = await member("save-accepted", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso aceptados")
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: session })

    const { data } = await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: session,
      p_answers: attempt.questionIds.map((id, i) => ({
        attempt_question_id: id,
        selected_option_id: attempt.optionsByQuestion.get(id)![0]!.id,
        client_seq: i + 1,
      })),
    })

    const accepted = data![0]!.accepted as { attempt_question_id: string; client_seq: number }[]
    expect(accepted).toHaveLength(2)
    expect(accepted.map((a) => a.attempt_question_id).sort()).toEqual([...attempt.questionIds].sort())
  })
})

describe("save_answers_batch: payload validation (F5)", () => {
  it("silently drops an option id that is not in this attempt's snapshot", async () => {
    const student = await member("save-bad-option", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso opción inválida")
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: session })

    const { data, error } = await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: session,
      p_answers: [
        {
          attempt_question_id: attempt.questionIds[0]!,
          selected_option_id: "00000000-0000-0000-0000-0000000000ff",
          client_seq: 1,
        },
      ],
    })

    expect(error).toBeNull()
    expect(data![0]!.accepted).toEqual([])
    const { data: row } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("selected_option_id")
      .eq("id", attempt.questionIds[0]!)
      .single()
    expect(row!.selected_option_id).toBeNull()
  })

  it("rejects a batch larger than 100 items", async () => {
    const student = await member("save-big-batch", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso lote grande")
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: session })

    const { error } = await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: session,
      p_answers: Array.from({ length: 101 }, () => ({
        attempt_question_id: attempt.questionIds[0]!,
        text_answer: "x",
        client_seq: 1,
      })),
    })
    expect(error?.message).toContain("INVALID_ANSWER")
  })

  it("drops a question id belonging to another attempt", async () => {
    const student = await member("save-foreign-question", ORG_A, "STUDENT")
    const mine = await startAttempt(student, "Curso propio guardar")
    const other = await startAttempt(student, "Curso ajeno guardar")
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: mine.attemptId, p_session: session })

    const { data } = await student.client.rpc("save_answers_batch", {
      p_attempt: mine.attemptId,
      p_session: session,
      p_answers: [{ attempt_question_id: other.questionIds[0]!, text_answer: "hola", client_seq: 1 }],
    })
    expect(data![0]!.accepted).toEqual([])
  })
})

describe("the deadline race (D1, red-team finding #1)", () => {
  it("accepts a save arriving 3s after the deadline, inside the 5s grace", async () => {
    const student = await member("deadline-grace", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso gracia", { durationSeconds: 3600 })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: session })

    await setDeadline(attempt.attemptId, -3)

    const { data, error } = await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: session,
      p_answers: [{ attempt_question_id: attempt.questionIds[0]!, text_answer: "a tiempo", client_seq: 1 }],
    })

    expect(error).toBeNull()
    expect((data![0]!.accepted as unknown[])).toHaveLength(1)
  })

  it("refuses a save 30s late, and the lazy finalize SURVIVES the call", async () => {
    const student = await member("deadline-late", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso tarde", { durationSeconds: 3600 })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: session })

    await setDeadline(attempt.attemptId, -30)

    const { data, error } = await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: session,
      p_answers: [{ attempt_question_id: attempt.questionIds[0]!, text_answer: "tarde", client_seq: 1 }],
    })

    // Reported as data, not as an exception. Raising here would roll back the
    // finalize performed moments earlier in the same transaction — the answer
    // would be refused AND the attempt left open, which is the worst of both.
    expect(error).toBeNull()
    expect(data![0]!.accepted).toEqual([])
    expect(data![0]!.status).not.toBe("IN_PROGRESS")

    const { data: row } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status")
      .eq("id", attempt.attemptId)
      .single()
    expect(row!.status).toBe("GRADED")

    // And the late answer was not stored.
    const { data: question } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("text_answer")
      .eq("id", attempt.questionIds[0]!)
      .single()
    expect(question!.text_answer).toBeNull()
  })

  it("refuses to auto-finalize inside the grace window, even from the sweep", async () => {
    const student = await member("deadline-sweep-early", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso barrido temprano", { durationSeconds: 3600 })
    await setDeadline(attempt.attemptId, -2)

    // The sweep's own predicate excludes it; calling finalize directly also
    // refuses, so a cron tick landing on the deadline cannot eat in-flight saves.
    const swept = await supabaseAdmin.rpc("finalize_expired_attempts")
    expect(swept.error).toBeNull()

    const { data } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status")
      .eq("id", attempt.attemptId)
      .single()
    expect(data!.status).toBe("IN_PROGRESS")
  })
})

describe("auto-submit", () => {
  it("the sweep finalizes an attempt past the deadline + grace", async () => {
    const student = await member("auto-submit", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso auto", { durationSeconds: 3600 })
    const session = randomUUID()
    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: session })

    const questionId = attempt.questionIds[0]!
    await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: session,
      p_answers: [
        {
          attempt_question_id: questionId,
          selected_option_id: attempt.correctByQuestion.get(questionId)!,
          client_seq: 1,
        },
      ],
    })

    await setDeadline(attempt.attemptId, -10)
    const { data: count } = await supabaseAdmin.rpc("finalize_expired_attempts")
    expect(count).toBeGreaterThanOrEqual(1)

    const { data } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status, max_score, score_percent, active_session_id")
      .eq("id", attempt.attemptId)
      .single()

    // MC-only: nothing left for a human, so it lands on GRADED directly.
    expect(data!.status).toBe("GRADED")
    expect(Number(data!.max_score)).toBe(2)
    // The answer saved before the deadline was graded.
    expect(Number(data!.score_percent)).toBeGreaterThan(0)
    expect(data!.active_session_id).toBeNull()
  })

  it("is idempotent: a second sweep does not re-finalize or double-score", async () => {
    const student = await member("auto-submit-idem", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso auto idempotente", { durationSeconds: 3600 })
    await setDeadline(attempt.attemptId, -10)

    await supabaseAdmin.rpc("finalize_expired_attempts")
    const { data: first } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status, total_score, submitted_at")
      .eq("id", attempt.attemptId)
      .single()

    await supabaseAdmin.rpc("finalize_expired_attempts")
    const { data: second } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status, total_score, submitted_at")
      .eq("id", attempt.attemptId)
      .single()

    expect(second).toEqual(first)
  })
})

describe("session locking (D3)", () => {
  it("blocks a second tab, then hands over on force", async () => {
    const student = await member("session-lock", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso sesiones")
    const tabOne = randomUUID()
    const tabTwo = randomUUID()

    const claimed = await student.client.rpc("heartbeat", {
      p_attempt: attempt.attemptId,
      p_session: tabOne,
    })
    expect(claimed.error).toBeNull()
    expect(claimed.data![0]!.active_session_id).toBe(tabOne)

    const blocked = await student.client.rpc("heartbeat", {
      p_attempt: attempt.attemptId,
      p_session: tabTwo,
    })
    expect(blocked.error?.message).toContain("SESSION_LOCKED")

    const forced = await student.client.rpc("heartbeat", {
      p_attempt: attempt.attemptId,
      p_session: tabTwo,
      p_force: true,
    })
    expect(forced.error).toBeNull()
    expect(forced.data![0]!.active_session_id).toBe(tabTwo)

    // The displaced tab learns it lost on its next beat.
    const displaced = await student.client.rpc("heartbeat", {
      p_attempt: attempt.attemptId,
      p_session: tabOne,
    })
    expect(displaced.error?.message).toContain("SESSION_LOCKED")
  })

  it("rejects writes from the displaced session", async () => {
    const student = await member("session-write", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso sesión escritura")
    const tabOne = randomUUID()
    const tabTwo = randomUUID()

    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: tabOne })
    await student.client.rpc("heartbeat", {
      p_attempt: attempt.attemptId,
      p_session: tabTwo,
      p_force: true,
    })

    const { error } = await student.client.rpc("save_answers_batch", {
      p_attempt: attempt.attemptId,
      p_session: tabOne,
      p_answers: [{ attempt_question_id: attempt.questionIds[0]!, text_answer: "vieja", client_seq: 1 }],
    })
    expect(error?.message).toContain("SESSION_LOCKED")
  })

  it("release_session lets the other tab claim without forcing", async () => {
    const student = await member("session-release", ORG_A, "STUDENT")
    const attempt = await startAttempt(student, "Curso liberar")
    const tabOne = randomUUID()
    const tabTwo = randomUUID()

    await student.client.rpc("heartbeat", { p_attempt: attempt.attemptId, p_session: tabOne })
    await student.client.rpc("release_session", { p_attempt: attempt.attemptId, p_session: tabOne })

    const claimed = await student.client.rpc("heartbeat", {
      p_attempt: attempt.attemptId,
      p_session: tabTwo,
    })
    expect(claimed.error).toBeNull()
    expect(claimed.data![0]!.active_session_id).toBe(tabTwo)
  })
})
