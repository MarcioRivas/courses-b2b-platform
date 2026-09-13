import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
  cleanupFixtures,
} from "../helpers/course-fixtures"

/**
 * Regressions for the Phase 4 review findings (M1–M4), plus the D29 cases the
 * reviewer found untested on the *write* RPC.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await supabaseAdmin.from("organizations").update({ status: "ACTIVE" }).eq("id", ORG_A)
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })

})

async function course(title: string, requiredBlocks: number) {
  const fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [{ title: "Módulo único", requiredBlocks }],
  })
  courseIds.push(fixture.courseId)
  return fixture
}

describe("M1: concurrent completions cannot drift the cache", () => {
  it("keeps completed_blocks equal to the real content_progress count", async () => {
    const student = await member("hardening-race", ORG_A, "STUDENT")
    const fixture = await course("Curso concurrencia", 4)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    // Fired together on purpose: before the FOR UPDATE lock, both calls counted
    // before either committed and the loser wrote a stale number.
    const results = await Promise.all(
      fixture.modules[0]!.blockIds.map((blockId) =>
        student.client.rpc("complete_content_block", {
          p_enrollment: enrollmentId,
          p_block: blockId,
          p_completed: true,
        })
      )
    )
    // Before the lock-ordering fix, half of these died with 40P01 (deadlock):
    // the content_progress INSERT takes a KEY SHARE lock on the parent
    // enrollment row via its FK, and asking for FOR UPDATE afterwards cycled.
    expect(results.every((result) => result.error === null)).toBe(true)

    const { count } = await supabaseAdmin
      .from("content_progress")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
    const { data } = await supabaseAdmin
      .from("course_enrollments")
      .select("completed_blocks, progress_percent, status")
      .eq("id", enrollmentId)
      .single()

    expect(count).toBe(4)
    expect(data!.completed_blocks).toBe(4)
    expect(Number(data!.progress_percent)).toBe(100)
    expect(data!.status).toBe("COMPLETED")
  })
})

describe("M2: completed_at survives a course growing", () => {
  it("keeps the original timestamp when a professor adds a required block", async () => {
    const student = await member("hardening-completed-at", ORG_A, "STUDENT")
    const fixture = await course("Curso creciente", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })

    const { data: finished } = await supabaseAdmin
      .from("course_enrollments")
      .select("completed_at")
      .eq("id", enrollmentId)
      .single()
    expect(finished!.completed_at).not.toBeNull()

    const { data: added } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({
        lesson_id: fixture.modules[0]!.lessonId,
        type: "RICH_TEXT",
        position: 50,
        data: { html: "<p>nuevo requisito</p>" },
        is_required: true,
      })
      .select("id")
      .single()

    // Any completion re-runs the recalc and sees the larger denominator.
    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })

    const { data: after } = await supabaseAdmin
      .from("course_enrollments")
      .select("status, total_blocks, completed_at")
      .eq("id", enrollmentId)
      .single()

    expect(after!.total_blocks).toBe(2)
    expect(after!.status).toBe("ACTIVE")
    // The student really does have new work — but they did finish the course as
    // it stood, and that fact is not the professor's to erase.
    expect(after!.completed_at).toBe(finished!.completed_at)

    // Un-ticking is the student's own action and DOES clear it.
    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: added!.id,
      p_completed: true,
    })
    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: added!.id,
      p_completed: false,
    })
    const { data: untied } = await supabaseAdmin
      .from("course_enrollments")
      .select("completed_at")
      .eq("id", enrollmentId)
      .single()
    expect(untied!.completed_at).toBeNull()
  })
})

describe("M4: refresh_course_enrollment_totals is not a client write path", () => {
  it("denies an authenticated caller", async () => {
    const student = await member("hardening-refresh", ORG_A, "STUDENT")
    const fixture = await course("Curso refresh", 1)

    const { error } = await student.client.rpc("refresh_course_enrollment_totals", {
      p_course: fixture.courseId,
    })
    expect(error).not.toBeNull()
  })
})

describe("M3: a closed course stays readable to its student", () => {
  it("still returns an ARCHIVED course's enrollment through my_enrollment_summaries", async () => {
    const student = await member("hardening-archived", ORG_A, "STUDENT")
    const fixture = await course("Curso archivado visible", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await supabaseAdmin
      .from("courses")
      .update({ status: "ARCHIVED", archived_at: new Date().toISOString() })
      .eq("id", fixture.courseId)

    // The RLS-scoped read is gone — this is exactly why the RPC exists.
    const { data: viaRls } = await student.client
      .from("courses")
      .select("id")
      .eq("id", fixture.courseId)
    expect(viaRls ?? []).toHaveLength(0)

    const { data } = await student.client.rpc("my_enrollment_summaries", {
      p_enrollment: enrollmentId,
    })
    expect(data).toHaveLength(1)
    expect(data![0]!.course_title).toBe("Curso archivado visible")
    expect(data![0]!.course_status).toBe("ARCHIVED")
  })

  it("never returns another student's enrollment", async () => {
    const owner = await member("hardening-summary-owner", ORG_A, "STUDENT")
    const intruder = await member("hardening-summary-intruder", ORG_A, "STUDENT")
    const fixture = await course("Curso resumen privado", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, owner.id)

    const { data } = await intruder.client.rpc("my_enrollment_summaries", {
      p_enrollment: enrollmentId,
    })
    expect(data ?? []).toHaveLength(0)
  })
})

describe("D29: revoked access cuts off the write RPC too", () => {
  it("refuses complete_content_block and enrollment_module_summary after deactivation", async () => {
    const student = await member("hardening-inactive-member", ORG_A, "STUDENT")
    const fixture = await course("Curso miembro inactivo", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await supabaseAdmin
      .from("organization_memberships")
      .update({ status: "INACTIVE" })
      .eq("organization_id", ORG_A)
      .eq("user_id", student.id)

    const write = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })
    expect(write.error?.code).toBe("42501")

    const summary = await student.client.rpc("enrollment_module_summary", {
      p_enrollment: enrollmentId,
    })
    expect(summary.error?.code).toBe("42501")

    const { data } = await student.client.rpc("my_enrollment_summaries")
    expect(data ?? []).toHaveLength(0)
  })

  it("refuses every student RPC once the organization itself is deactivated", async () => {
    const student = await member("hardening-inactive-org", ORG_A, "STUDENT")
    const fixture = await course("Curso org inactiva", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await supabaseAdmin.from("organizations").update({ status: "INACTIVE" }).eq("id", ORG_A)

    const write = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })
    expect(write.error?.code).toBe("42501")

    const unlock = await student.client.rpc("module_unlock_state", { p_enrollment: enrollmentId })
    expect(unlock.error?.code).toBe("42501")

    await supabaseAdmin.from("organizations").update({ status: "ACTIVE" }).eq("id", ORG_A)
  })
})

describe("QUIZ_PASSED dependency (stub replaced in Phase 5)", () => {
  it("locks the module until a passing attempt exists", async () => {
    // Phase 4 shipped this branch stubbed to "satisfied" and asserted the
    // permissive behaviour here so it could not ship silently. Phase 5's
    // `module_unlock_state` replaced the stub, so the expectation is now the
    // strict one — and the fake assessment id this test used no longer
    // satisfies the FK that Phase 5 added, so a real assessment is required.
    const student = await member("hardening-quiz-real", ORG_A, "STUDENT")
    const fixture = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso quiz dependencia",
      modules: [
        { title: "Módulo 1", requiredBlocks: 1 },
        { title: "Módulo 2", requiredBlocks: 1 },
      ],
    })
    courseIds.push(fixture.courseId)

    const assessment = await makeAssessmentFixture({
      courseId: fixture.courseId,
      organizationId: ORG_A,
      title: "Quiz dependencia",
      kind: "QUIZ",
      multipleChoice: 1,
    })
    bankIds.push(assessment.bankId)

    await supabaseAdmin.from("module_dependencies").insert({
      module_id: fixture.modules[1]!.id,
      condition: "QUIZ_PASSED",
      assessment_id: assessment.assessmentId,
      min_score: 60,
    })

    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)
    const { data } = await student.client.rpc("module_unlock_state", { p_enrollment: enrollmentId })

    expect(data!.find((row) => row.module_id === fixture.modules[1]!.id)?.state).toBe(
      "LOCKED_DEPENDENCY"
    )
  })

  it("rejects a dependency pointing at an assessment that does not exist", async () => {
    const fixture = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso quiz FK",
      modules: [{ title: "Módulo 1", requiredBlocks: 1 }],
    })
    courseIds.push(fixture.courseId)

    const { error } = await supabaseAdmin.from("module_dependencies").insert({
      module_id: fixture.modules[0]!.id,
      condition: "QUIZ_PASSED",
      assessment_id: "00000000-0000-0000-0000-0000000000bb",
      min_score: 60,
    })
    // The FK Phase 3 deferred and Phase 5 finally added (D6).
    expect(error?.code).toBe("23503")
  })
})
