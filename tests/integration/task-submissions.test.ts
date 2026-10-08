import { afterAll, describe, expect, it } from "vitest"
import { createMemberFactory } from "../helpers/membership"
import { supabaseAdmin } from "../helpers/supabase-admin"
import { cleanupFixtures, enrollStudent, makeAssessmentFixture, makeCourseFixture, assignOfferingProfessor } from "../helpers/course-fixtures"
import type { TestUser } from "../helpers/make-user"
import { buildPendingAttemptsQuery } from "@/features/grading/queries/pending-attempts-query"

/**
 * TASK file submissions: the submission gate (deadline, late submissions,
 * file count, path prefix, object existence), replacement, completion, the
 * after-deadline grading rule and the owner/grader read paths.
 */

const ORG_A = "11111111-1111-1111-1111-111111111111"
const BUCKET = "task-submissions"
const PDF = new Blob(["%PDF-1.4 tarea"], { type: "application/pdf" })

const cleanup: string[] = []
const courseIds: string[] = []
const bankIds: string[] = []
const storedPaths: string[] = []
const member = createMemberFactory(cleanup)

afterAll(async () => {
  if (storedPaths.length > 0) {
    await supabaseAdmin.storage.from(BUCKET).remove(storedPaths)
  }
  await cleanupFixtures({ users: cleanup, courseIds, bankIds })
})

interface TaskSetup {
  professor: TestUser
  student: TestUser
  courseId: string
  enrollmentId: string
  assessmentId: string
  blockId: string
}

async function setupTask(label: string, options: { maxFiles?: number; allowLate?: boolean } = {}): Promise<TaskSetup> {
  const professor = await member(`${label}-prof`, ORG_A, "PROFESSOR")
  const student = await member(`${label}-student`, ORG_A, "STUDENT")
  const course = await makeCourseFixture({
    organizationId: ORG_A,
    title: `Curso ${label}`,
    modules: [{ title: "Módulo", requiredBlocks: 1 }],
  })
  courseIds.push(course.courseId)
  await assignOfferingProfessor(course.offeringId, professor.id)

  const fixture = await makeAssessmentFixture({
    offeringId: course.offeringId,
    organizationId: ORG_A,
    title: `Tarea ${label}`,
    kind: "TASK",
    maxFiles: options.maxFiles ?? 1,
    allowLateSubmissions: options.allowLate ?? false,
  })
  bankIds.push(fixture.bankId)

  const { data: block } = await supabaseAdmin
    .from("lesson_content_blocks")
    .insert({
      lesson_id: course.modules[0]!.lessonId,
      type: "TASK",
      position: 99,
      data: {},
      is_required: true,
      assessment_id: fixture.assessmentId,
    })
    .select("id")
    .single()
  if (!block) throw new Error("TASK block not created")

  const enrollmentId = await enrollStudent(course, ORG_A, student.id)
  return { professor, student, courseId: course.courseId, enrollmentId, assessmentId: fixture.assessmentId, blockId: block.id }
}

function prefixOf(setup: TaskSetup): string {
  return `${ORG_A}/${setup.courseId}/${setup.assessmentId}/${setup.enrollmentId}/`
}

/** Mirrors `prepareTaskUpload` + the browser: a service-signed URL, uploaded to with the student's client. */
async function uploadAs(setup: TaskSetup, name: string, prefix = prefixOf(setup)): Promise<string> {
  const path = `${prefix}${crypto.randomUUID()}-${name}`
  const { data: signed, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path)
  if (error || !signed) throw error ?? new Error("no signed upload url")
  const { error: uploadError } = await setup.student.client.storage
    .from(BUCKET)
    .uploadToSignedUrl(path, signed.token, PDF, { contentType: "application/pdf" })
  if (uploadError) throw uploadError
  storedPaths.push(path)
  return path
}

function submit(setup: TaskSetup, paths: string[], client = setup.student.client) {
  return client.rpc("submit_task", {
    p_assessment: setup.assessmentId,
    p_enrollment: setup.enrollmentId,
    p_files: paths.map((path) => ({ path, filename: path.split("/").pop() ?? "f.pdf" })),
  })
}

async function moveDeadline(assessmentId: string, offsetMs: number) {
  const { error } = await supabaseAdmin
    .from("assessments")
    .update({ available_until: new Date(Date.now() + offsetMs).toISOString() })
    .eq("id", assessmentId)
  if (error) throw error
}

describe("submit_task", () => {
  it("records the submission, reads size/MIME from storage and completes the TASK block", async () => {
    const setup = await setupTask("happy")
    const path = await uploadAs(setup, "trabajo.pdf")

    const { data, error } = await submit(setup, [path])
    expect(error).toBeNull()
    const attemptId = data?.[0]?.attempt_id
    expect(attemptId).toBeTruthy()

    const { data: attempt } = await supabaseAdmin
      .from("assessment_attempts")
      .select("status, submitted_late, max_score")
      .eq("id", attemptId!)
      .single()
    expect(attempt).toMatchObject({ status: "SUBMITTED", submitted_late: false, max_score: 100 })

    const { data: files } = await supabaseAdmin
      .from("assessment_submission_files")
      .select("mime_type, size_bytes, filename")
      .eq("attempt_id", attemptId!)
    expect(files).toHaveLength(1)
    expect(files![0]).toMatchObject({ mime_type: "application/pdf", size_bytes: PDF.size })

    const { count } = await supabaseAdmin
      .from("content_progress")
      .select("id", { count: "exact", head: true })
      .eq("enrollment_id", setup.enrollmentId)
      .eq("content_block_id", setup.blockId)
    expect(count).toBe(1)
  })

  it("replaces the file set before the deadline and reports the removed paths", async () => {
    const setup = await setupTask("replace")
    const first = await uploadAs(setup, "v1.pdf")
    await submit(setup, [first])

    const second = await uploadAs(setup, "v2.pdf")
    const { data, error } = await submit(setup, [second])
    expect(error).toBeNull()
    expect(data?.[0]?.removed_paths).toEqual([first])

    const { data: files } = await supabaseAdmin
      .from("assessment_submission_files")
      .select("storage_path")
      .eq("attempt_id", data![0]!.attempt_id)
    expect(files?.map((f) => f.storage_path)).toEqual([second])
  })

  it("rejects more files than allowed, foreign paths and paths that were never uploaded", async () => {
    const setup = await setupTask("limits", { maxFiles: 1 })
    const a = await uploadAs(setup, "a.pdf")
    const b = await uploadAs(setup, "b.pdf")

    const tooMany = await submit(setup, [a, b])
    expect(tooMany.error?.message).toContain("TOO_MANY_FILES")

    const other = await setupTask("limits-other")
    const foreign = await uploadAs(other, "ajeno.pdf")
    const outside = await submit(setup, [foreign])
    expect(outside.error?.message).toContain("INVALID_FILES")

    const ghost = await submit(setup, [`${prefixOf(setup)}${crypto.randomUUID()}-fantasma.pdf`])
    expect(ghost.error?.message).toContain("INVALID_FILES")
  })

  it("refuses another student's enrollment", async () => {
    const setup = await setupTask("intruder")
    const intruder = await member("intruder", ORG_A, "STUDENT")
    const path = await uploadAs(setup, "x.pdf")

    const { error } = await submit(setup, [path], intruder.client)
    expect(error?.message).toContain("NOT_ENROLLED")
  })

  it("freezes an on-time submission at the deadline and refuses a first one without late submissions", async () => {
    const onTime = await setupTask("frozen", { allowLate: true })
    const path = await uploadAs(onTime, "a.pdf")
    await submit(onTime, [path])
    await moveDeadline(onTime.assessmentId, -60_000)
    const replace = await submit(onTime, [await uploadAs(onTime, "b.pdf")])
    expect(replace.error?.message).toContain("WINDOW_CLOSED")

    const strict = await setupTask("strict", { allowLate: false })
    const strictPath = await uploadAs(strict, "a.pdf")
    await moveDeadline(strict.assessmentId, -60_000)
    const late = await submit(strict, [strictPath])
    expect(late.error?.message).toContain("WINDOW_CLOSED")
  })

  it("accepts a late submission when allowed, marks it, and locks it once graded", async () => {
    const setup = await setupTask("late", { allowLate: true })
    await moveDeadline(setup.assessmentId, -60_000)

    const { data, error } = await submit(setup, [await uploadAs(setup, "tarde.pdf")])
    expect(error).toBeNull()
    const attemptId = data![0]!.attempt_id

    const { data: attempt } = await supabaseAdmin
      .from("assessment_attempts")
      .select("submitted_late")
      .eq("id", attemptId)
      .single()
    expect(attempt?.submitted_late).toBe(true)

    // Still replaceable while ungraded…
    const again = await submit(setup, [await uploadAs(setup, "tarde-2.pdf")])
    expect(again.error).toBeNull()

    // …and locked once graded.
    const grade = await setup.professor.client.rpc("grade_task_submission", { p_attempt: attemptId, p_score: 70 })
    expect(grade.error).toBeNull()
    const afterGrade = await submit(setup, [await uploadAs(setup, "tarde-3.pdf")])
    expect(afterGrade.error?.message).toContain("ALREADY_GRADED")
  })

  it("keeps a graded submission final even if the deadline is moved later", async () => {
    const setup = await setupTask("reopen")
    const { data } = await submit(setup, [await uploadAs(setup, "a.pdf")])
    await moveDeadline(setup.assessmentId, -60_000)
    await setup.professor.client.rpc("grade_task_submission", { p_attempt: data![0]!.attempt_id, p_score: 80 })

    await moveDeadline(setup.assessmentId, 60 * 60_000)
    const again = await submit(setup, [await uploadAs(setup, "b.pdf")])
    expect(again.error?.message).toContain("ALREADY_GRADED")
  })

  it("refuses a display filename whose extension does not match the stored file", async () => {
    const setup = await setupTask("spoof")
    const path = await uploadAs(setup, "real.pdf")
    const { error } = await setup.student.client.rpc("submit_task", {
      p_assessment: setup.assessmentId,
      p_enrollment: setup.enrollmentId,
      p_files: [{ path, filename: "notas.pdf.exe" }],
    })
    expect(error?.message).toContain("INVALID_FILES")
  })
})

describe("TASK guards", () => {
  it("start_attempt refuses a TASK and questions cannot be attached to one", async () => {
    const setup = await setupTask("guards")

    const start = await setup.student.client.rpc("start_attempt", {
      p_enrollment: setup.enrollmentId,
      p_assessment: setup.assessmentId,
    })
    expect(start.error?.message).toContain("USE_TASK_SUBMISSION")

    const { data: question } = await supabaseAdmin
      .from("questions")
      .select("id")
      .limit(1)
      .maybeSingle()
    if (question) {
      const { error } = await supabaseAdmin
        .from("assessment_questions")
        .insert({ assessment_id: setup.assessmentId, question_id: question.id, position: 1, points: 1 })
      expect(error?.message).toContain("TASK_HAS_NO_QUESTIONS")
    }
  })
})

describe("grade_task_submission", () => {
  it("is refused before the deadline and grades 0..100 with the org scale after it", async () => {
    const setup = await setupTask("grading")
    const { data } = await submit(setup, [await uploadAs(setup, "g.pdf")])
    const attemptId = data![0]!.attempt_id

    const early = await setup.professor.client.rpc("grade_task_submission", { p_attempt: attemptId, p_score: 90 })
    expect(early.error?.message).toContain("DEADLINE_NOT_PASSED")

    await moveDeadline(setup.assessmentId, -60_000)

    const outOfRange = await setup.professor.client.rpc("grade_task_submission", { p_attempt: attemptId, p_score: 101 })
    expect(outOfRange.error?.message).toContain("INVALID_ANSWER")

    const graded = await setup.professor.client.rpc("grade_task_submission", {
      p_attempt: attemptId,
      p_score: 85,
      p_feedback: "Muy buen trabajo",
    })
    expect(graded.error).toBeNull()
    expect(graded.data?.[0]).toMatchObject({ status: "GRADED", score_percent: 85, score_label: "Muy bueno", passed: true })

    const stale = await setup.professor.client.rpc("grade_task_submission", {
      p_attempt: attemptId,
      p_score: 60,
      p_submitted_at: "2000-01-01T00:00:00Z",
    })
    expect(stale.error?.message).toContain("STALE_SUBMISSION")

    const mine = await setup.student.client.rpc("my_task_submission", {
      p_assessment: setup.assessmentId,
      p_enrollment: setup.enrollmentId,
    })
    expect(mine.data?.[0]).toMatchObject({ status: "GRADED", score_percent: 85, feedback: "Muy buen trabajo" })
  })

  it("refuses a professor from another course and the student themself", async () => {
    const setup = await setupTask("grade-deny")
    const { data } = await submit(setup, [await uploadAs(setup, "d.pdf")])
    const attemptId = data![0]!.attempt_id
    await moveDeadline(setup.assessmentId, -60_000)

    const stranger = await member("grade-stranger", ORG_A, "PROFESSOR")
    const byStranger = await stranger.client.rpc("grade_task_submission", { p_attempt: attemptId, p_score: 50 })
    expect(byStranger.error?.code).toBe("42501")

    const bySelf = await setup.student.client.rpc("grade_task_submission", { p_attempt: attemptId, p_score: 100 })
    expect(bySelf.error?.code).toBe("42501")
  })
})

describe("reads", () => {
  it("masks the score until graded and lets only the owner or a grader resolve a file", async () => {
    const setup = await setupTask("reads")
    const { data } = await submit(setup, [await uploadAs(setup, "r.pdf")])
    const attemptId = data![0]!.attempt_id

    const mine = await setup.student.client.rpc("my_task_submission", {
      p_assessment: setup.assessmentId,
      p_enrollment: setup.enrollmentId,
    })
    const row = mine.data?.[0]
    expect(row).toMatchObject({ status: "SUBMITTED", score_percent: null, feedback: null })
    const fileId = (row?.files as { id: string }[])[0]!.id

    const owner = await setup.student.client.rpc("task_file_for_download", { p_file: fileId })
    expect(owner.error).toBeNull()
    const grader = await setup.professor.client.rpc("task_file_for_download", { p_file: fileId })
    expect(grader.error).toBeNull()

    const classmate = await member("reads-classmate", ORG_A, "STUDENT")
    const denied = await classmate.client.rpc("task_file_for_download", { p_file: fileId })
    expect(denied.error?.code).toBe("42501")

    // Students never read the files table directly; the grader does.
    const direct = await setup.student.client.from("assessment_submission_files").select("id").eq("attempt_id", attemptId)
    expect(direct.data).toEqual([])
    const asGrader = await setup.professor.client.from("assessment_submission_files").select("id").eq("attempt_id", attemptId)
    expect(asGrader.data).toHaveLength(1)
  })

  it("gives students no direct write access to the bucket, even under their own prefix", async () => {
    const setup = await setupTask("direct-upload")
    const { error } = await setup.student.client.storage
      .from(BUCKET)
      .upload(`${prefixOf(setup)}${crypto.randomUUID()}-directo.pdf`, PDF, { contentType: "application/pdf" })
    expect(error).not.toBeNull()
  })
})

describe("grading queue and bucket rules", () => {
  it("keeps a TASK submission out of the pending queue until its deadline passes", async () => {
    const setup = await setupTask("queue")
    const { data } = await submit(setup, [await uploadAs(setup, "q.pdf")])
    const attemptId = data![0]!.attempt_id
    const pendingIds = async () => {
      const { data: rows } = await buildPendingAttemptsQuery(setup.professor.client, { statusGroup: "PENDING", page: 1 })
      return (rows ?? []).map((row) => row.id)
    }

    expect(await pendingIds()).not.toContain(attemptId)
    await moveDeadline(setup.assessmentId, -60_000)
    expect(await pendingIds()).toContain(attemptId)
  })

  it("rejects disallowed types and files over 20 MB at upload time", async () => {
    const setup = await setupTask("bucket")
    const upload = async (name: string, body: Blob, contentType: string) => {
      const path = `${prefixOf(setup)}${crypto.randomUUID()}-${name}`
      const { data: signed } = await supabaseAdmin.storage.from(BUCKET).createSignedUploadUrl(path)
      storedPaths.push(path)
      return setup.student.client.storage.from(BUCKET).uploadToSignedUrl(path, signed!.token, body, { contentType })
    }

    const zip = await upload("a.zip", new Blob(["PK"], { type: "application/zip" }), "application/zip")
    expect(zip.error).not.toBeNull()

    const big = new Blob([new Uint8Array(20 * 1024 * 1024 + 1)], { type: "application/pdf" })
    const tooLarge = await upload("big.pdf", big, "application/pdf")
    expect(tooLarge.error).not.toBeNull()
  })
})
