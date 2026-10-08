import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { randomUUID } from "node:crypto"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { enrollStudent, makeAssessmentFixture, makeCourseFixture, cleanupFixtures, assignOfferingProfessor } from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"

/**
 * Phase 6 — every analytics number is asserted against a hand-computed
 * fixture. `org_overview_stats` aggregates the WHOLE org, and ORG_A is
 * shared across the suite, so it is asserted as a delta from a baseline
 * captured right after this file's own admin is created (fileParallelism is
 * off — see vitest.config.ts — so no other file mutates ORG_A meanwhile).
 * Every other function returns per-entity rows, found by this fixture's own
 * ids regardless of what else exists in the org.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

interface ScoreRange {
  label: string
  min_score: number
  max_score: number
  is_passing: boolean
}

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

let admin: TestUser
let professor: TestUser
let student1: TestUser
let student2: TestUser
let courseId: string
let offeringId: string
let mcAssessmentId: string
let openAssessmentId: string
let ranges: ScoreRange[]
let baseline: Record<string, number>

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
})

function rangeFor(percent: number): ScoreRange | undefined {
  return ranges.find((r) => percent >= r.min_score && percent <= r.max_score)
}

async function submitMcAttempt(
  student: TestUser,
  enrollmentId: string,
  assessmentId: string,
  optionIdsInOrder: (string | null)[]
): Promise<string> {
  const { data: attemptId } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: assessmentId,
  })
  if (!attemptId) throw new Error("attempt not started")
  const session = randomUUID()
  await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })

  const { data: snapshot } = await supabaseAdmin
    .from("assessment_attempt_questions")
    .select("id")
    .eq("attempt_id", attemptId)
    .order("position")

  const answers = (snapshot ?? []).map((row, index) => ({
    attempt_question_id: row.id,
    selected_option_id: optionIdsInOrder[index],
    client_seq: index + 1,
  }))
  await student.client.rpc("submit_attempt", { p_attempt: attemptId, p_session: session, p_answers: answers })
  return attemptId
}

async function submitOpenAttempt(
  student: TestUser,
  enrollmentId: string,
  assessmentId: string
): Promise<{ attemptId: string; questionId: string }> {
  const { data: attemptId } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: assessmentId,
  })
  if (!attemptId) throw new Error("attempt not started")
  const session = randomUUID()
  await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })

  const { data: snapshot } = await supabaseAdmin
    .from("assessment_attempt_questions")
    .select("id")
    .eq("attempt_id", attemptId)
  const questionId = snapshot![0]!.id
  await student.client.rpc("submit_attempt", {
    p_attempt: attemptId,
    p_session: session,
    p_answers: [{ attempt_question_id: questionId, text_answer: "mi respuesta", client_seq: 1 }],
  })
  return { attemptId, questionId }
}

beforeAll(async () => {
  admin = await member("acc-admin", ORG_A, "ADMIN")
  const { data: baselineRow } = await admin.client.rpc("org_overview_stats", { p_org: ORG_A })
  baseline = baselineRow![0] as unknown as Record<string, number>

  const { data: rangeRows } = await supabaseAdmin
    .from("score_scale_ranges")
    .select("label, min_score, max_score, is_passing")
    .eq("organization_id", ORG_A)
  ranges = rangeRows ?? []

  professor = await member("acc-prof", ORG_A, "PROFESSOR")
  student1 = await member("acc-student1", ORG_A, "STUDENT")
  student2 = await member("acc-student2", ORG_A, "STUDENT")

  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: "Curso analítica",
    modules: [{ title: "Módulo único", requiredBlocks: 2 }],
  })
  courseIds.push(course.courseId)
  courseId = course.courseId
  offeringId = course.offeringId
  await assignOfferingProfessor(course.offeringId, professor.id)

  const enrollment1 = await enrollStudent(course, ORG_A, student1.id)
  const enrollment2 = await enrollStudent(course, ORG_A, student2.id)

  await supabaseAdmin
    .from("course_enrollments")
    .update({ completed_blocks: 2, progress_percent: 100, status: "COMPLETED", completed_at: new Date().toISOString() })
    .eq("id", enrollment1)
  await supabaseAdmin
    .from("content_progress")
    .insert(course.modules[0]!.blockIds.map((blockId) => ({ enrollment_id: enrollment1, content_block_id: blockId })))

  await supabaseAdmin
    .from("course_enrollments")
    .update({ completed_blocks: 1, progress_percent: 50 })
    .eq("id", enrollment2)
  await supabaseAdmin
    .from("content_progress")
    .insert({ enrollment_id: enrollment2, content_block_id: course.modules[0]!.blockIds[0]! })

  const mcFixture = await makeAssessmentFixture({
    offeringId,
    organizationId: ORG_A,
    title: "Quiz analítica MC",
    kind: "QUIZ",
    multipleChoice: 2,
  })
  bankIds.push(mcFixture.bankId)
  mcAssessmentId = mcFixture.assessmentId

  const { data: wrongOption } = await supabaseAdmin
    .from("question_options")
    .select("id")
    .eq("question_id", mcFixture.questions[1]!.questionId)
    .eq("is_correct", false)
    .limit(1)
    .single()

  // Student1: both correct -> 100%. Student2: 1/2 correct -> 50%.
  await submitMcAttempt(student1, enrollment1, mcAssessmentId, [
    mcFixture.questions[0]!.correctOptionId,
    mcFixture.questions[1]!.correctOptionId,
  ])
  await submitMcAttempt(student2, enrollment2, mcAssessmentId, [
    mcFixture.questions[0]!.correctOptionId,
    wrongOption!.id,
  ])

  const openFixture = await makeAssessmentFixture({
    offeringId,
    organizationId: ORG_A,
    title: "Tarea analítica",
    kind: "EXAM",
    openEnded: 1,
    durationSeconds: 3600,
    availableFrom: new Date().toISOString(),
    availableUntil: new Date(Date.now() + 3600000).toISOString(),
  })
  bankIds.push(openFixture.bankId)
  openAssessmentId = openFixture.assessmentId

  // Student1's open answer gets graded (100%); student2's stays SUBMITTED (pending).
  const graded = await submitOpenAttempt(student1, enrollment1, openAssessmentId)
  await professor.client.rpc("grade_open_answer", {
    p_attempt: graded.attemptId,
    p_attempt_question: graded.questionId,
    p_points: 1,
  })
  await submitOpenAttempt(student2, enrollment2, openAssessmentId)
}, 60000)

describe("org_overview_stats", () => {
  it("delta matches exactly what this fixture added", async () => {
    const { data } = await admin.client.rpc("org_overview_stats", { p_org: ORG_A })
    const row = data![0] as unknown as Record<string, number>
    const delta = (key: string) => Number(row[key]) - Number(baseline[key])

    expect(delta("students_total")).toBe(2)
    expect(delta("students_active")).toBe(2)
    expect(delta("students_with_enrollment")).toBe(2)
    expect(delta("students_completed_course")).toBe(1)
    expect(delta("professors_total")).toBe(1)
    expect(delta("professors_active")).toBe(1)
    expect(delta("courses_published")).toBe(1)
    expect(delta("attempts_in_progress")).toBe(0)
    expect(delta("attempts_submitted")).toBe(1)
    expect(delta("attempts_auto_submitted")).toBe(0)
    expect(delta("attempts_graded")).toBe(3)
  })
})

describe("org_course_stats", () => {
  it("computes enrollment/progress/completion for this course", async () => {
    const { data } = await admin.client.rpc("org_course_stats", { p_org: ORG_A })
    const row = (data ?? []).find((r) => r.course_id === courseId)!
    expect(row.offerings_count).toBe(1)
    expect(row.enrolled_count).toBe(2)
    expect(Number(row.avg_progress_percent)).toBe(75)
    expect(Number(row.completion_rate)).toBe(50)
    expect(row.last_activity).not.toBeNull()
  })
})

describe("org_professor_stats", () => {
  it("counts assigned courses, grading and pending work for this professor", async () => {
    const { data } = await admin.client.rpc("org_professor_stats", { p_org: ORG_A })
    const row = (data ?? []).find((r) => r.professor_user_id === professor.id)!
    expect(row.assigned_courses_count).toBe(1)
    expect(row.attempts_graded_count).toBe(1)
    expect(row.last_graded_at).not.toBeNull()
    expect(row.pending_grading_count).toBe(1)
  })
})

describe("org_assessment_stats", () => {
  it("computes MC assessment totals and pass/fail from the org's score ranges", async () => {
    const { data } = await admin.client.rpc("org_assessment_stats", { p_org: ORG_A })
    const row = (data ?? []).find((r) => r.assessment_id === mcAssessmentId)!
    const passing100 = rangeFor(100)?.is_passing ?? null
    const passing50 = rangeFor(50)?.is_passing ?? null

    expect(row.attempts_count).toBe(2)
    expect(row.submitted_count).toBe(2)
    expect(row.graded_count).toBe(2)
    expect(Number(row.avg_score_percent)).toBe(75)
    expect(row.passed_count).toBe([passing100, passing50].filter((p) => p === true).length)
    expect(row.failed_count).toBe([passing100, passing50].filter((p) => p === false).length)
  })

  it("computes the open-ended assessment totals, only counting the graded attempt", async () => {
    const { data } = await admin.client.rpc("org_assessment_stats", { p_org: ORG_A })
    const row = (data ?? []).find((r) => r.assessment_id === openAssessmentId)!
    expect(row.attempts_count).toBe(2)
    expect(row.submitted_count).toBe(2)
    expect(row.graded_count).toBe(1)
    expect(Number(row.avg_score_percent)).toBe(100)
  })
})

describe("assessment_score_distribution", () => {
  it("buckets the two GRADED MC attempts by the org's score ranges", async () => {
    const { data } = await admin.client.rpc("assessment_score_distribution", { p_assessment: mcAssessmentId })
    const actual = new Map((data ?? []).map((row) => [row.label, row.bucket_count]))

    const label100 = rangeFor(100)?.label ?? "Sin rango"
    const label50 = rangeFor(50)?.label ?? "Sin rango"
    const expected = new Map<string, number>()
    expected.set(label100, (expected.get(label100) ?? 0) + 1)
    expected.set(label50, (expected.get(label50) ?? 0) + 1)

    for (const [label, count] of expected) {
      expect(actual.get(label) ?? 0).toBe(count)
    }
  })

  // H1 regression: score_scale_ranges is int-only, assessment_attempts.score_percent
  // is numeric(5,2) — a fractional score must bucket on floor(), never "Sin rango".
  // Uses its own throwaway course/assessment so it never perturbs the shared
  // courseId/openAssessmentId numbers asserted by other describes in this file.
  it("buckets a fractional score by floor(score_percent), never 'Sin rango'", async () => {
    const fractionalPercent = 69.5
    const range = rangeFor(Math.floor(fractionalPercent))
    expect(range).toBeDefined()

    const fracCourse = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso fracción",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(fracCourse.courseId)

    const fracFixture = await makeAssessmentFixture({
      offeringId: fracCourse.offeringId,
      organizationId: ORG_A,
      title: "Tarea fracción",
      kind: "EXAM",
      openEnded: 1,
      durationSeconds: 3600,
      availableFrom: new Date().toISOString(),
      availableUntil: new Date(Date.now() + 3600000).toISOString(),
    })
    bankIds.push(fracFixture.bankId)

    const student3 = await member("acc-student3", ORG_A, "STUDENT")
    const enrollmentId = await enrollStudent(fracCourse, ORG_A, student3.id)

    const { attemptId } = await submitOpenAttempt(student3, enrollmentId, fracFixture.assessmentId)
    await supabaseAdmin
      .from("assessment_attempts")
      .update({ status: "GRADED", score_percent: fractionalPercent, passed: range!.is_passing })
      .eq("id", attemptId)

    const { data } = await admin.client.rpc("assessment_score_distribution", {
      p_assessment: fracFixture.assessmentId,
    })
    const actual = new Map((data ?? []).map((row) => [row.label, row.bucket_count]))

    expect(actual.get("Sin rango") ?? 0).toBe(0)
    expect(actual.get(range!.label) ?? 0).toBe(1)
  })

  // H1 regression, unmatched case: a percent below every range's min_score
  // still has nowhere to floor() into and must land in "Sin rango".
  it("still buckets an out-of-range score into 'Sin rango'", async () => {
    const belowEveryRange = Math.min(...ranges.map((r) => r.min_score)) - 1
    expect(rangeFor(belowEveryRange)).toBeUndefined()

    const outCourse = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso sin rango",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(outCourse.courseId)

    const outFixture = await makeAssessmentFixture({
      offeringId: outCourse.offeringId,
      organizationId: ORG_A,
      title: "Tarea sin rango",
      kind: "EXAM",
      openEnded: 1,
      durationSeconds: 3600,
      availableFrom: new Date().toISOString(),
      availableUntil: new Date(Date.now() + 3600000).toISOString(),
    })
    bankIds.push(outFixture.bankId)

    const student4 = await member("acc-student4", ORG_A, "STUDENT")
    const enrollmentId = await enrollStudent(outCourse, ORG_A, student4.id)

    const { attemptId } = await submitOpenAttempt(student4, enrollmentId, outFixture.assessmentId)
    await supabaseAdmin
      .from("assessment_attempts")
      .update({ status: "GRADED", score_percent: belowEveryRange, passed: false })
      .eq("id", attemptId)

    const { data } = await admin.client.rpc("assessment_score_distribution", {
      p_assessment: outFixture.assessmentId,
    })
    const actual = new Map((data ?? []).map((row) => [row.label, row.bucket_count]))

    expect(actual.get("Sin rango") ?? 0).toBe(1)
  })
})

describe("professor_overview_stats", () => {
  it("shows only the professor's own course with the same numbers as org_professor_stats/org_course_stats", async () => {
    const { data } = await professor.client.rpc("professor_overview_stats")
    expect(data).toHaveLength(1)
    const row = data![0]!
    expect(row.course_id).toBe(courseId)
    expect(row.enrolled_count).toBe(2)
    expect(Number(row.avg_progress_percent)).toBe(75)
    expect(row.attempts_in_progress).toBe(0)
    expect(row.attempts_submitted).toBe(1)
    expect(row.attempts_auto_submitted).toBe(0)
    expect(row.attempts_graded).toBe(3)
    expect(row.pending_grading_count).toBe(1)
  })
})
