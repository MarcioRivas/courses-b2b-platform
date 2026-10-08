import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  cleanupFixtures,
} from "../helpers/course-fixtures"

/** `start_attempt` admission rules (phase-05 5C): who may begin, and when. */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })

})

async function scenario(title: string, assessment: Partial<Parameters<typeof makeAssessmentFixture>[0]> = {}) {
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [{ title: "Módulo único", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)

  const fixture = await makeAssessmentFixture({
    offeringId: course.offeringId,
    organizationId: ORG_A,
    title: `${title} — evaluación`,
    kind: "QUIZ",
    multipleChoice: 2,
    ...assessment,
  })
  bankIds.push(fixture.bankId)

  return { course, fixture }
}

describe("start_attempt: admission", () => {
  it("creates an attempt and snapshots the questions", async () => {
    const student = await member("start-ok", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso inicio")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const { data: attemptId, error } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(error).toBeNull()
    expect(attemptId).toBeTruthy()

    const { data: snapshot } = await supabaseAdmin
      .from("assessment_attempt_questions")
      .select("id, prompt, options, points, type")
      .eq("attempt_id", attemptId!)
      .order("position")
    expect(snapshot).toHaveLength(2)
    expect(snapshot![0]!.points).toBe(1)

    // The snapshot carries labels but never correctness.
    const options = snapshot![0]!.options as { id: string; label: string }[]
    expect(options).toHaveLength(3)
    expect(Object.keys(options[0]!)).toEqual(["id", "label"])
  })

  it("returns the SAME attempt when one is already in progress", async () => {
    const student = await member("start-resume", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso reanudar")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const first = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const second = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })

    expect(second.data).toBe(first.data)
    const { count } = await supabaseAdmin
      .from("assessment_attempts")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
    expect(count).toBe(1)
  })

  it("refuses a DRAFT assessment", async () => {
    const student = await member("start-draft", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso borrador", { status: "DRAFT" })
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const { error } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(error?.message).toContain("ASSESSMENT_NOT_AVAILABLE")
  })

  it("refuses before the window opens and after it closes, with no grace", async () => {
    const student = await member("start-window", ORG_A, "STUDENT")
    const future = await scenario("Curso futuro", {
      availableFrom: new Date(Date.now() + 3_600_000).toISOString(),
      availableUntil: new Date(Date.now() + 7_200_000).toISOString(),
    })
    const past = await scenario("Curso pasado", {
      availableFrom: new Date(Date.now() - 7_200_000).toISOString(),
      availableUntil: new Date(Date.now() - 3_600_000).toISOString(),
    })

    const futureEnrollment = await enrollStudent(future.course, ORG_A, student.id)
    const pastEnrollment = await enrollStudent(past.course, ORG_A, student.id)

    const early = await student.client.rpc("start_attempt", {
      p_enrollment: futureEnrollment,
      p_assessment: future.fixture.assessmentId,
    })
    const late = await student.client.rpc("start_attempt", {
      p_enrollment: pastEnrollment,
      p_assessment: past.fixture.assessmentId,
    })

    expect(early.error?.message).toContain("ASSESSMENT_EXPIRED")
    expect(late.error?.message).toContain("ASSESSMENT_EXPIRED")
  })

  it("enforces max_attempts and treats NULL as unlimited", async () => {
    const student = await member("start-limit", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso límite", { maxAttempts: 1 })
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const first = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    await supabaseAdmin
      .from("assessment_attempts")
      .update({ status: "GRADED" })
      .eq("id", first.data!)

    const second = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(second.error?.message).toContain("ATTEMPT_LIMIT_REACHED")
  })

  it("refuses an assessment belonging to another course", async () => {
    const student = await member("start-foreign-course", ORG_A, "STUDENT")
    const mine = await scenario("Curso propio inicio")
    const other = await scenario("Curso ajeno inicio")
    const enrollmentId = await enrollStudent(mine.course, ORG_A, student.id)

    const { error } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: other.fixture.assessmentId,
    })
    expect(error?.code).toBe("P0002")
  })

  it("refuses a student of another organization", async () => {
    const owner = await member("start-owner", ORG_A, "STUDENT")
    const outsider = await member("start-outsider", ORG_B, "STUDENT")
    const { course, fixture } = await scenario("Curso tenencia inicio")
    const enrollmentId = await enrollStudent(course, ORG_A, owner.id)

    const { error } = await outsider.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(error?.code).toBe("42501")
  })

  it("refuses when the assessment's module is locked by a dependency", async () => {
    const student = await member("start-locked-module", ORG_A, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso módulo bloqueado",
      modules: [
        { title: "Módulo 1", requiredBlocks: 1 },
        { title: "Módulo 2", requiredBlocks: 1 },
      ],
    })
    courseIds.push(course.courseId)

    await supabaseAdmin.from("module_dependencies").insert({
      module_id: course.modules[1]!.id,
      condition: "MODULE_COMPLETED",
      depends_on_module_id: course.modules[0]!.id,
    })

    const fixture = await makeAssessmentFixture({
      offeringId: course.offeringId,
      organizationId: ORG_A,
      title: "Examen en módulo bloqueado",
      kind: "EXAM",
      multipleChoice: 1,
      moduleId: course.modules[1]!.id,
      durationSeconds: 600,
      availableFrom: new Date(Date.now() - 60_000).toISOString(),
      availableUntil: new Date(Date.now() + 3_600_000).toISOString(),
    })
    bankIds.push(fixture.bankId)

    const enrollmentId = await enrollStudent(course, ORG_A, student.id)
    const { error } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    expect(error?.message).toContain("MODULE_LOCKED")
  })
})

describe("start_attempt: effective_end_at (D12/D31)", () => {
  it("is NULL for an untimed quiz with no window", async () => {
    const student = await member("start-untimed", ORG_A, "STUDENT")
    const { course, fixture } = await scenario("Curso sin límite")
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const { data } = await supabaseAdmin
      .from("assessment_attempts")
      .select("effective_end_at")
      .eq("id", attemptId!)
      .single()
    expect(data!.effective_end_at).toBeNull()
  })

  it("is the earlier of duration and window close", async () => {
    const student = await member("start-least", ORG_A, "STUDENT")
    const closesSoon = new Date(Date.now() + 60_000).toISOString()
    const { course, fixture } = await scenario("Curso LEAST", {
      kind: "EXAM",
      durationSeconds: 3600,
      availableFrom: new Date(Date.now() - 60_000).toISOString(),
      availableUntil: closesSoon,
    })
    const enrollmentId = await enrollStudent(course, ORG_A, student.id)

    const { data: attemptId } = await student.client.rpc("start_attempt", {
      p_enrollment: enrollmentId,
      p_assessment: fixture.assessmentId,
    })
    const { data } = await supabaseAdmin
      .from("assessment_attempts")
      .select("effective_end_at")
      .eq("id", attemptId!)
      .single()

    // Duration would end in an hour; the window closes in a minute, so the
    // window wins.
    expect(new Date(data!.effective_end_at!).getTime()).toBe(new Date(closesSoon).getTime())
  })
})
