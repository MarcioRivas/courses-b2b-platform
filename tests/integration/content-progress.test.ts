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
 * `complete_content_block` + `recalc_enrollment_progress` (phase-04,
 * D14/D24/D29/D33): what the student may write, what the cache must say
 * afterwards, and who is refused.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

const cleanup: string[] = []
const courseIds: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds })

})

async function course(title: string, requiredBlocks: number, optionalBlocks = 0) {
  const fixture = await makeCourseFixture({
    organizationId: ORG_A,
    title,
    modules: [{ title: "Módulo único", requiredBlocks, optionalBlocks }],
  })
  courseIds.push(fixture.courseId)
  return fixture
}

async function enrollmentRow(enrollmentId: string) {
  const { data } = await supabaseAdmin
    .from("course_enrollments")
    .select("status, progress_percent, completed_blocks, total_blocks, started_at, completed_at")
    .eq("id", enrollmentId)
    .single()
  return data!
}

describe("complete_content_block: progress cache", () => {
  it("moves the cache in the same request and flips the enrollment to COMPLETED at 100%", async () => {
    const student = await member("progress-cache", ORG_A, "STUDENT")
    const fixture = await course("Curso caché", 2)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const before = await enrollmentRow(enrollmentId)
    expect(before.total_blocks).toBe(2)
    expect(before.started_at).toBeNull()

    const { data: first } = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })
    expect(Number(first![0]!.progress_percent)).toBe(50)

    const mid = await enrollmentRow(enrollmentId)
    expect(mid.status).toBe("ACTIVE")
    expect(mid.started_at).not.toBeNull()

    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[1]!,
      p_completed: true,
    })

    const done = await enrollmentRow(enrollmentId)
    expect(Number(done.progress_percent)).toBe(100)
    expect(done.status).toBe("COMPLETED")
    expect(done.completed_at).not.toBeNull()
  })

  it("reverts status and completed_at when a block is un-ticked", async () => {
    const student = await member("progress-revert", ORG_A, "STUDENT")
    const fixture = await course("Curso revertir", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)
    const blockId = fixture.modules[0]!.blockIds[0]!

    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: blockId,
      p_completed: true,
    })
    expect((await enrollmentRow(enrollmentId)).status).toBe("COMPLETED")

    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: blockId,
      p_completed: false,
    })

    const reverted = await enrollmentRow(enrollmentId)
    expect(reverted.status).toBe("ACTIVE")
    expect(reverted.completed_at).toBeNull()
    expect(Number(reverted.progress_percent)).toBe(0)
  })

  it("reports 0% for a course with no required blocks and never completes it", async () => {
    const student = await member("progress-empty", ORG_A, "STUDENT")
    const fixture = await course("Curso opcional", 0, 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const { error } = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.optionalBlockIds[0]!,
      p_completed: true,
    })
    expect(error).toBeNull()

    const row = await enrollmentRow(enrollmentId)
    expect(row.total_blocks).toBe(0)
    expect(Number(row.progress_percent)).toBe(0)
    expect(row.status).toBe("ACTIVE")
  })

  it("recounts the denominator lazily: a block added later lands on the next completion (D14)", async () => {
    const student = await member("progress-lazy", ORG_A, "STUDENT")
    const fixture = await course("Curso perezoso", 2)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })
    expect((await enrollmentRow(enrollmentId)).total_blocks).toBe(2)

    await supabaseAdmin.from("lesson_content_blocks").insert({
      lesson_id: fixture.modules[0]!.lessonId,
      type: "RICH_TEXT",
      position: 99,
      data: { html: "<p>nuevo</p>" },
      is_required: true,
    })

    // No trigger fires: the stale denominator is the documented trade-off.
    expect((await enrollmentRow(enrollmentId)).total_blocks).toBe(2)

    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[1]!,
      p_completed: true,
    })
    expect((await enrollmentRow(enrollmentId)).total_blocks).toBe(3)
  })

  it("keeps two offerings of the same course independent (§47)", async () => {
    const one = await member("progress-parallel-1", ORG_A, "STUDENT")
    const two = await member("progress-parallel-2", ORG_A, "STUDENT")
    const fixture = await course("Curso paralelo progreso", 2)

    // The fixture's offering is the course's single OPEN one (D13), so the
    // second execution has to be a GROUP offering.
    const { data: group } = await supabaseAdmin
      .from("groups")
      .insert({ organization_id: ORG_A, name: `Grupo paralelo ${Date.now()}` })
      .select("id")
      .single()
    const { data: offeringTwo } = await supabaseAdmin
      .from("course_offerings")
      .insert({
        course_id: fixture.courseId,
        organization_id: ORG_A,
        kind: "GROUP",
        group_id: group!.id,
        name: "Segunda edición",
      })
      .select("id")
      .single()

    const enrollmentOne = await enrollStudent(fixture, ORG_A, one.id)
    const { data: enrollmentTwo } = await supabaseAdmin
      .from("course_enrollments")
      .insert({
        organization_id: ORG_A,
        course_id: fixture.courseId,
        offering_id: offeringTwo!.id,
        user_id: two.id,
        source: "GROUP_ASSIGNMENT",
        total_blocks: 2,
      })
      .select("id")
      .single()

    await one.client.rpc("complete_content_block", {
      p_enrollment: enrollmentOne,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })

    expect(Number((await enrollmentRow(enrollmentOne)).progress_percent)).toBe(50)
    expect(Number((await enrollmentRow(enrollmentTwo!.id)).progress_percent)).toBe(0)

    await supabaseAdmin.from("groups").delete().eq("id", group!.id)
  })
})

describe("complete_content_block: refusals", () => {
  it("refuses a QUIZ block — its progress row belongs to finalize_attempt (D33)", async () => {
    const student = await member("progress-quiz", ORG_A, "STUDENT")
    const fixture = await course("Curso quiz", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    // Phase 5 added the real FK from `lesson_content_blocks.assessment_id`, so
    // the placeholder uuid this test used originally no longer inserts — a
    // QUIZ block now needs an assessment that actually exists.
    const assessment = await makeAssessmentFixture({
      offeringId: fixture.offeringId,
      organizationId: ORG_A,
      title: "Quiz de bloque (rechazo manual)",
      kind: "QUIZ",
      multipleChoice: 1,
    })

    const { data: quizBlock } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({
        lesson_id: fixture.modules[0]!.lessonId,
        type: "QUIZ",
        position: 50,
        data: {},
        assessment_id: assessment.assessmentId,
        is_required: true,
      })
      .select("id")
      .single()

    const { error } = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: quizBlock!.id,
      p_completed: true,
    })
    expect(error?.message).toContain("INVALID_BLOCK_TYPE")
  })

  it("refuses a block whose module is locked by a dependency", async () => {
    const student = await member("progress-locked", ORG_A, "STUDENT")
    const fixture = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso bloqueado",
      modules: [
        { title: "Módulo 1", requiredBlocks: 1 },
        { title: "Módulo 2", requiredBlocks: 1 },
      ],
    })
    courseIds.push(fixture.courseId)

    await supabaseAdmin.from("module_dependencies").insert({
      module_id: fixture.modules[1]!.id,
      condition: "MODULE_COMPLETED",
      depends_on_module_id: fixture.modules[0]!.id,
    })

    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const { error } = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[1]!.blockIds[0]!,
      p_completed: true,
    })
    expect(error?.message).toContain("MODULE_LOCKED")
  })

  it("refuses a student of another organization", async () => {
    const owner = await member("progress-tenant-owner", ORG_A, "STUDENT")
    const outsider = await member("progress-tenant-outsider", ORG_B, "STUDENT")
    const fixture = await course("Curso tenencia progreso", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, owner.id)

    const { error } = await outsider.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })
    expect(error?.code).toBe("42501")

    const { count } = await supabaseAdmin
      .from("content_progress")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", enrollmentId)
    expect(count).toBe(0)
  })

  it("refuses an org admin writing progress on a student's behalf", async () => {
    const student = await member("progress-admin-student", ORG_A, "STUDENT")
    const admin = await member("progress-admin", ORG_A, "ADMIN")
    const fixture = await course("Curso admin progreso", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const { error } = await admin.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })
    expect(error?.code).toBe("42501")
  })

  it("refuses a block belonging to another course", async () => {
    const student = await member("progress-foreign-block", ORG_A, "STUDENT")
    const enrolled = await course("Curso inscripto", 1)
    const other = await course("Curso ajeno bloque", 1)
    const enrollmentId = await enrollStudent(enrolled, ORG_A, student.id)

    const { error } = await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: other.modules[0]!.blockIds[0]!,
      p_completed: true,
    })
    expect(error?.code).toBe("P0002")
  })
})

describe("content_progress: no client write path (D24)", () => {
  it("denies a direct insert even for the owner of the enrollment", async () => {
    const student = await member("progress-direct-insert", ORG_A, "STUDENT")
    const fixture = await course("Curso escritura directa", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const { error } = await student.client
      .from("content_progress")
      .insert({ enrollment_id: enrollmentId, content_block_id: fixture.modules[0]!.blockIds[0]! })

    expect(error).not.toBeNull()
    expect((await enrollmentRow(enrollmentId)).completed_blocks).toBe(0)
  })

  it("denies calling recalc_enrollment_progress directly", async () => {
    const student = await member("progress-direct-recalc", ORG_A, "STUDENT")
    const fixture = await course("Curso recalc directo", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    const { error } = await student.client.rpc("recalc_enrollment_progress", {
      p_enrollment: enrollmentId,
    })
    expect(error).not.toBeNull()
  })
})

describe("enrollment_module_summary", () => {
  it("counts required blocks per module for the owner", async () => {
    const student = await member("summary-owner", ORG_A, "STUDENT")
    const fixture = await course("Curso resumen", 3, 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, student.id)

    await student.client.rpc("complete_content_block", {
      p_enrollment: enrollmentId,
      p_block: fixture.modules[0]!.blockIds[0]!,
      p_completed: true,
    })

    const { data } = await student.client.rpc("enrollment_module_summary", {
      p_enrollment: enrollmentId,
    })
    expect(data![0]!.total_required).toBe(3)
    expect(data![0]!.completed_required).toBe(1)
  })

  it("refuses someone else's enrollment (D25)", async () => {
    const owner = await member("summary-owner-2", ORG_A, "STUDENT")
    const intruder = await member("summary-intruder", ORG_A, "STUDENT")
    const fixture = await course("Curso resumen ajeno", 1)
    const enrollmentId = await enrollStudent(fixture, ORG_A, owner.id)

    const { error } = await intruder.client.rpc("enrollment_module_summary", {
      p_enrollment: enrollmentId,
    })
    expect(error?.code).toBe("42501")
  })
})
