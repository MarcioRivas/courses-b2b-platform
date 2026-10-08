import { randomUUID } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import {
  assignOfferingProfessor,
  cleanupFixtures,
  enrollStudent,
  makeAssessmentFixture,
  makeCourseFixture,
} from "../helpers/course-fixtures"

/**
 * B1: professors belong to an edition, not a course. A professor of edition 1
 * must see and grade nothing of edition 2 of the same course (attempts,
 * attempt questions, grades, feedback, enrollments, progress, staff list).
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const orgIds: string[] = []
const member = createMemberFactory(cleanup)

type Member = Awaited<ReturnType<typeof member>>

afterAll(async () => {
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
  for (const id of orgIds) await supabaseAdmin.from("organizations").delete().eq("id", id)
})

async function submitAndGrade(student: Member, professor: Member, enrollmentId: string, assessmentId: string) {
  const { data: attemptId, error } = await student.client.rpc("start_attempt", {
    p_enrollment: enrollmentId,
    p_assessment: assessmentId,
  })
  if (error || !attemptId) throw error ?? new Error("attempt not started")
  const session = randomUUID()
  await student.client.rpc("heartbeat", { p_attempt: attemptId, p_session: session })
  const { data: questions } = await supabaseAdmin
    .from("assessment_attempt_questions")
    .select("id")
    .eq("attempt_id", attemptId)
  const answers = (questions ?? []).map((q, i) => ({
    attempt_question_id: q.id,
    text_answer: "respuesta",
    client_seq: i + 1,
  }))
  await student.client.rpc("submit_attempt", { p_attempt: attemptId, p_session: session, p_answers: answers })
  await professor.client.rpc("grade_open_answer", {
    p_attempt: attemptId,
    p_attempt_question: questions![0]!.id,
    p_points: 1,
    p_feedback: "Bien.",
  })
  await professor.client.rpc("upsert_attempt_feedback", { p_attempt: attemptId, p_feedback: "Comentario." })
  return { attemptId, attemptQuestionId: questions![0]!.id }
}

describe("edition A professor vs edition B", () => {
  let prof1: Member
  let prof2: Member
  let admin: Member
  let offering1: string
  let offering2: string
  let enrollment1: string
  let enrollment2: string
  let attempt1: string
  let attempt2: string
  let attemptQuestion2: string
  let assessmentId: string
  let videoBlockId: string

  beforeAll(async () => {
    prof1 = await member("op-prof-1", ORG_A, "PROFESSOR")
    prof2 = await member("op-prof-2", ORG_A, "PROFESSOR")
    admin = await member("op-admin", ORG_A, "ADMIN")
    const student1 = await member("op-student-1", ORG_A, "STUDENT")
    const student2 = await member("op-student-2", ORG_A, "STUDENT")

    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso ediciones aisladas",
      modules: [{ title: "Módulo único", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    offering1 = course.offeringId

    const { data: group } = await supabaseAdmin
      .from("groups")
      .insert({ organization_id: ORG_A, name: `Grupo op ${Date.now()}` })
      .select("id")
      .single()
    const { data: second, error } = await supabaseAdmin
      .from("course_offerings")
      .insert({ course_id: course.courseId, organization_id: ORG_A, kind: "GROUP", group_id: group!.id, name: "Edición 2" })
      .select("id")
      .single()
    if (error || !second) throw error ?? new Error("second offering not created")
    offering2 = second.id

    await assignOfferingProfessor(offering1, prof1.id)
    await assignOfferingProfessor(offering2, prof2.id)

    const fixture = await makeAssessmentFixture({
      courseId: course.courseId,
      organizationId: ORG_A,
      title: "Examen ediciones",
      kind: "EXAM",
      openEnded: 1,
      durationSeconds: 3600,
      availableFrom: new Date().toISOString(),
      availableUntil: new Date(Date.now() + 3600000).toISOString(),
    })
    bankIds.push(fixture.bankId)
    assessmentId = fixture.assessmentId

    const { data: video } = await supabaseAdmin
      .from("lesson_content_blocks")
      .insert({ lesson_id: course.modules[0]!.lessonId, type: "YOUTUBE_VIDEO", position: 9, data: { videoId: "dQw4w9WgXcQ" }, is_required: false })
      .select("id")
      .single()
    videoBlockId = video!.id

    enrollment1 = await enrollStudent(course, ORG_A, student1.id)
    enrollment2 = await enrollStudent({ ...course, offeringId: offering2 }, ORG_A, student2.id)

    for (const [enrollmentId, blockId] of [
      [enrollment1, course.modules[0]!.blockIds[0]!],
      [enrollment2, course.modules[0]!.blockIds[0]!],
    ] as const) {
      await supabaseAdmin.from("content_progress").insert({ enrollment_id: enrollmentId, content_block_id: blockId })
    }

    const first = await submitAndGrade(student1, prof1, enrollment1, fixture.assessmentId)
    const secondAttempt = await submitAndGrade(student2, prof2, enrollment2, fixture.assessmentId)
    attempt1 = first.attemptId
    attempt2 = secondAttempt.attemptId
    attemptQuestion2 = secondAttempt.attemptQuestionId
  }, 60_000)

  async function ids(client: Member["client"], table: string, column: string, value: string) {
    const { data } = await client.from(table as "assessment_attempts").select("id").eq(column, value)
    return (data ?? []).length
  }

  it("sees attempts of its own edition only", async () => {
    expect(await ids(prof1.client, "assessment_attempts", "id", attempt1)).toBe(1)
    expect(await ids(prof1.client, "assessment_attempts", "id", attempt2)).toBe(0)
    expect(await ids(prof2.client, "assessment_attempts", "id", attempt2)).toBe(1)
    expect(await ids(prof2.client, "assessment_attempts", "id", attempt1)).toBe(0)
  })

  it("sees attempt questions, grades and feedback of its own edition only", async () => {
    for (const table of ["assessment_attempt_questions", "assessment_grades", "assessment_feedback"] as const) {
      const own = await prof1.client.from(table).select("attempt_id").eq("attempt_id", attempt1)
      const foreign = await prof1.client.from(table).select("attempt_id").eq("attempt_id", attempt2)
      expect(own.data?.length, `${table} own`).toBeGreaterThan(0)
      expect(foreign.data, `${table} foreign`).toEqual([])
    }
  })

  it("cannot grade, comment on or view an attempt of another edition", async () => {
    const grade = await prof1.client.rpc("grade_open_answer", {
      p_attempt: attempt2,
      p_attempt_question: attemptQuestion2,
      p_points: 0,
      p_feedback: "intruso",
    })
    expect(grade.error?.code).toBe("42501")

    const feedback = await prof1.client.rpc("upsert_attempt_feedback", { p_attempt: attempt2, p_feedback: "intruso" })
    expect(feedback.error?.code).toBe("42501")

    expect((await prof1.client.rpc("can_grade_attempt", { p_attempt: attempt2 })).data).toBe(false)
    expect((await prof1.client.rpc("can_view_attempt", { p_attempt: attempt2 })).data).toBe(false)
    expect((await prof1.client.rpc("can_grade_attempt", { p_attempt: attempt1 })).data).toBe(true)
    expect((await prof1.client.rpc("can_view_enrollment", { p_enrollment: enrollment2 })).data).toBe(false)
    expect((await prof1.client.rpc("can_view_enrollment", { p_enrollment: enrollment1 })).data).toBe(true)
  })

  it("sees enrollments and progress of its own edition only", async () => {
    const own = await prof1.client.from("course_enrollments").select("id").eq("id", enrollment1)
    const foreign = await prof1.client.from("course_enrollments").select("id").eq("id", enrollment2)
    expect(own.data).toHaveLength(1)
    expect(foreign.data).toEqual([])

    const ownProgress = await prof1.client.from("content_progress").select("id").eq("enrollment_id", enrollment1)
    const foreignProgress = await prof1.client.from("content_progress").select("id").eq("enrollment_id", enrollment2)
    expect(ownProgress.data).toHaveLength(1)
    expect(foreignProgress.data).toEqual([])
  })

  it("sees only its own edition and its staff list", async () => {
    const offerings = await prof1.client.from("course_offerings").select("id").in("id", [offering1, offering2])
    expect((offerings.data ?? []).map((o) => o.id)).toEqual([offering1])

    const staff = await prof1.client.from("offering_professors").select("offering_id, user_id")
    expect(staff.data).toEqual([{ offering_id: offering1, user_id: prof1.id }])
  })

  it("keeps working on course-level reads through any of its editions", async () => {
    const courses = await prof1.client.from("courses").select("id")
    expect(courses.data).toHaveLength(1)
    const { data: can } = await prof1.client.rpc("can_edit_course_content", { p_course: courseIds[0]! })
    expect(can).toBe(true)
  })

  it("the admin still sees both editions' attempts", async () => {
    expect(await ids(admin.client, "assessment_attempts", "id", attempt1)).toBe(1)
    expect(await ids(admin.client, "assessment_attempts", "id", attempt2)).toBe(1)
  })

  it("assessment_score_distribution counts only the caller's editions for a professor", async () => {
    const total = async (client: Member["client"]) => {
      const { data, error } = await client.rpc("assessment_score_distribution", { p_assessment: assessmentId })
      expect(error).toBeNull()
      return (data ?? []).reduce((sum, row) => sum + Number(row.bucket_count), 0)
    }
    expect(await total(prof1.client)).toBe(1)
    expect(await total(prof2.client)).toBe(1)
    expect(await total(admin.client)).toBe(2)
  })

  it("video_checkpoint_stats counts only the caller's editions for a professor", async () => {
    const checkpoints = [
      {
        atSeconds: 30,
        minCorrect: 1,
        questions: [{ prompt: "¿A?", options: [{ label: "Sí", isCorrect: true }, { label: "No", isCorrect: false }] }],
      },
    ]
    const saved = await prof1.client.rpc("save_video_checkpoints", { p_block: videoBlockId, p_checkpoints: checkpoints as never })
    expect(saved.error).toBeNull()

    const enrolled = async (client: Member["client"]) => {
      const { data, error } = await client.rpc("video_checkpoint_stats", { p_block: videoBlockId })
      expect(error).toBeNull()
      return (data as unknown as { enrolledCount: number }).enrolledCount
    }
    expect(await enrolled(prof1.client)).toBe(1)
    expect(await enrolled(prof2.client)).toBe(1)
    expect(await enrolled(admin.client)).toBe(2)
  })

  it("professors cannot write offering_professors", async () => {
    const insert = await prof1.client.from("offering_professors").insert({ offering_id: offering2, user_id: prof1.id })
    expect(insert.error).not.toBeNull()
    const del = await prof1.client
      .from("offering_professors")
      .delete()
      .eq("offering_id", offering1)
      .eq("user_id", prof1.id)
      .select("user_id")
    expect(del.data ?? []).toEqual([])
  })
})

describe("professor of an INACTIVE org", () => {
  it("loses every edition-scoped read", async () => {
    const { data: org } = await supabaseAdmin
      .from("organizations")
      .insert({ name: "Org op inactiva", slug: `op-inactiva-${randomUUID().slice(0, 8)}`, status: "ACTIVE" })
      .select("id")
      .single()
    const orgId = org!.id
    orgIds.push(orgId)
    await supabaseAdmin.from("organization_settings").insert({ organization_id: orgId })

    const professor = await member("op-inactive-prof", orgId, "PROFESSOR")
    const student = await member("op-inactive-student", orgId, "STUDENT")
    const course = await makeCourseFixture({
      organizationId: orgId,
      title: "Curso org inactiva",
      modules: [{ title: "Módulo", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    await assignOfferingProfessor(course.offeringId, professor.id)
    const enrollmentId = await enrollStudent(course, orgId, student.id)

    const before = await professor.client.from("course_enrollments").select("id").eq("id", enrollmentId)
    expect(before.data).toHaveLength(1)

    await supabaseAdmin.from("organizations").update({ status: "INACTIVE" }).eq("id", orgId)

    const enrollments = await professor.client.from("course_enrollments").select("id").eq("id", enrollmentId)
    const offerings = await professor.client.from("course_offerings").select("id").eq("id", course.offeringId)
    const staff = await professor.client.from("offering_professors").select("user_id")
    expect(enrollments.data ?? []).toEqual([])
    expect(offerings.data ?? []).toEqual([])
    expect(staff.data ?? []).toEqual([])
    expect((await professor.client.rpc("is_offering_professor", { p_offering: course.offeringId })).data).toBe(false)
    expect((await professor.client.rpc("is_professor_of_any_edition", { p_course: course.courseId })).data).toBe(false)
  })
})

describe("search_assignable_professors", () => {
  const tag = `Zq${Date.now().toString().slice(-6)}`
  let admin: Member
  let adminB: Member
  let professor: Member
  let offeringId: string
  const candidates: Member[] = []

  beforeAll(async () => {
    admin = await member("op-search-admin", ORG_A, "ADMIN")
    professor = await member("op-search-prof", ORG_A, "PROFESSOR")
    adminB = await member("op-search-admin-b", "22222222-2222-2222-2222-222222222222", "ADMIN")
    for (let i = 0; i < 5; i++) {
      const candidate = await member(`op-search-cand-${i}`, ORG_A, "PROFESSOR")
      await supabaseAdmin.from("profiles").update({ first_name: `${tag}${i}`, last_name: "Buscable" }).eq("id", candidate.id)
      candidates.push(candidate)
    }
    const course = await makeCourseFixture({
      organizationId: ORG_A,
      title: "Curso búsqueda",
      modules: [{ title: "Módulo", requiredBlocks: 1 }],
    })
    courseIds.push(course.courseId)
    offeringId = course.offeringId
  }, 60_000)

  it("returns at most 3 rows with user_id, full_name and email", async () => {
    const { data, error } = await admin.client.rpc("search_assignable_professors", { p_offering: offeringId, p_q: tag })
    expect(error).toBeNull()
    expect(data).toHaveLength(3)
    expect(Object.keys(data![0]!).sort()).toEqual(["email", "full_name", "user_id"])
  })

  it("excludes professors already assigned to the edition", async () => {
    await assignOfferingProfessor(offeringId, candidates[0]!.id)
    const { data } = await admin.client.rpc("search_assignable_professors", { p_offering: offeringId, p_q: `${tag}0` })
    expect(data).toEqual([])
  })

  it("requires 2+ characters and treats %, _, \\, comma and parenthesis literally", async () => {
    for (const q of ["a", "", "%%", "__", "\\\\", "x,y)", "%) or (1=1", `${tag}%`]) {
      const { data, error } = await admin.client.rpc("search_assignable_professors", { p_offering: offeringId, p_q: q })
      expect(error, q).toBeNull()
      expect(data, q).toEqual([])
    }
  })

  it("never returns students (only ACTIVE professors match)", async () => {
    const student = await member("op-search-student", ORG_A, "STUDENT")
    await supabaseAdmin.from("profiles").update({ first_name: `${tag}Alumno` }).eq("id", student.id)
    const { data } = await admin.client.rpc("search_assignable_professors", { p_offering: offeringId, p_q: `${tag}Alumno` })
    expect(data).toEqual([])
  })

  it("is admin-only and derives the org from the offering", async () => {
    const asProfessor = await professor.client.rpc("search_assignable_professors", { p_offering: offeringId, p_q: tag })
    expect(asProfessor.error?.code).toBe("42501")
    const asForeignAdmin = await adminB.client.rpc("search_assignable_professors", { p_offering: offeringId, p_q: tag })
    expect(asForeignAdmin.error?.code).toBe("42501")
  })
})

describe("course_offerings identity is frozen", () => {
  it("rejects changing course_id, organization_id or kind but allows renaming", async () => {
    const one = await makeCourseFixture({ organizationId: ORG_A, title: "Curso freeze 1", modules: [] })
    const two = await makeCourseFixture({ organizationId: ORG_A, title: "Curso freeze 2", modules: [] })
    courseIds.push(one.courseId, two.courseId)

    const moveCourse = await supabaseAdmin.from("course_offerings").update({ course_id: two.courseId }).eq("id", one.offeringId)
    expect(moveCourse.error?.message).toContain("immutable")
    const changeKind = await supabaseAdmin.from("course_offerings").update({ kind: "GROUP" }).eq("id", one.offeringId)
    expect(changeKind.error?.message).toContain("immutable")
    const rename = await supabaseAdmin.from("course_offerings").update({ name: "Renombrada" }).eq("id", one.offeringId)
    expect(rename.error).toBeNull()
  })
})
