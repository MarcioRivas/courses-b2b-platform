import { supabaseAdmin } from "./supabase-admin"
import type { Database } from "@/types/database.types"

type CourseStatus = Database["public"]["Enums"]["course_status"]
type CourseAccess = Database["public"]["Enums"]["course_access"]
type OfferingStatus = Database["public"]["Enums"]["offering_status"]

export interface ModuleSpec {
  title: string
  /** Number of REQUIRED RICH_TEXT blocks in the module's single lesson. */
  requiredBlocks: number
  optionalBlocks?: number
}

export interface CourseFixture {
  courseId: string
  offeringId: string
  modules: { id: string; lessonId: string; blockIds: string[]; optionalBlockIds: string[] }[]
}

export interface MakeCourseOptions {
  organizationId: string
  title: string
  modules: ModuleSpec[]
  status?: CourseStatus
  accessType?: CourseAccess
  offeringEndsAt?: string | null
  offeringStatus?: OfferingStatus
}

/**
 * Builds course → OPEN edition → module → lesson → blocks with the service
 * role (content belongs to the edition). Deliberately bypasses the authoring RPCs: these suites exercise the
 * Phase 4 progression functions, not Phase 3's write paths.
 *
 * Push the returned `courseId` onto the caller's cleanup array — deleting the
 * course cascades to everything below it, including enrollments and progress.
 */
export async function makeCourseFixture(options: MakeCourseOptions): Promise<CourseFixture> {
  const { data: course, error } = await supabaseAdmin
    .from("courses")
    .insert({
      organization_id: options.organizationId,
      title: options.title,
      status: options.status ?? "PUBLISHED",
      access_type: options.accessType ?? "PRIVATE",
      published_at: (options.status ?? "PUBLISHED") === "DRAFT" ? null : new Date().toISOString(),
    })
    .select("id")
    .single()
  if (error || !course) throw error ?? new Error("course not created")

  // The edition owns the content (B2): create it before any module.
  const { data: offering } = await supabaseAdmin
    .from("course_offerings")
    .insert({
      course_id: course.id,
      organization_id: options.organizationId,
      kind: "OPEN",
      name: `${options.title} — edición`,
      ends_at: options.offeringEndsAt ?? null,
      status: options.offeringStatus ?? "ACTIVE",
    })
    .select("id")
    .single()
  if (!offering) throw new Error("offering not created")

  const modules: CourseFixture["modules"] = []

  for (const [index, spec] of options.modules.entries()) {
    const { data: module } = await supabaseAdmin
      .from("modules")
      .insert({ offering_id: offering.id, title: spec.title, position: index + 1 })
      .select("id")
      .single()
    if (!module) throw new Error("module not created")

    const { data: lesson } = await supabaseAdmin
      .from("lessons")
      .insert({ module_id: module.id, title: `${spec.title} — lección`, position: 1 })
      .select("id")
      .single()
    if (!lesson) throw new Error("lesson not created")

    const rows = [
      ...Array.from({ length: spec.requiredBlocks }, (_, i) => ({ required: true, position: i + 1 })),
      ...Array.from({ length: spec.optionalBlocks ?? 0 }, (_, i) => ({
        required: false,
        position: spec.requiredBlocks + i + 1,
      })),
    ]

    const blockIds: string[] = []
    const optionalBlockIds: string[] = []

    if (rows.length > 0) {
      const { data: blocks } = await supabaseAdmin
        .from("lesson_content_blocks")
        .insert(
          rows.map((row) => ({
            lesson_id: lesson.id,
            type: "RICH_TEXT" as const,
            position: row.position,
            data: { html: `<p>bloque ${row.position}</p>` },
            is_required: row.required,
          }))
        )
        .select("id, is_required, position")
      for (const block of (blocks ?? []).sort((a, b) => a.position - b.position)) {
        if (block.is_required) blockIds.push(block.id)
        else optionalBlockIds.push(block.id)
      }
    }

    modules.push({ id: module.id, lessonId: lesson.id, blockIds, optionalBlockIds })
  }

  return { courseId: course.id, offeringId: offering.id, modules }
}

/**
 * Materialises one enrollment directly (the roster sync is Phase 3's concern),
 * seeding `total_blocks` the way `sync_offering_enrollments` and
 * `self_enroll_free_course` do so fixtures start from a realistic row.
 */
export async function enrollStudent(
  fixture: CourseFixture,
  organizationId: string,
  userId: string
): Promise<string> {
  const { data, error } = await supabaseAdmin
    .from("course_enrollments")
    .insert({
      organization_id: organizationId,
      course_id: fixture.courseId,
      offering_id: fixture.offeringId,
      user_id: userId,
      source: "GROUP_ASSIGNMENT",
      total_blocks: fixture.modules.reduce((sum, module) => sum + module.blockIds.length, 0),
    })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("enrollment not created")
  return data.id
}

/** Returns the course's first edition, creating an OPEN one when it has none (for courses built by hand). */
export async function ensureOffering(courseId: string, organizationId: string): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from("course_offerings")
    .select("id")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing) return existing.id

  const { data, error } = await supabaseAdmin
    .from("course_offerings")
    .insert({ course_id: courseId, organization_id: organizationId, kind: "OPEN", name: "Edición de prueba" })
    .select("id")
    .single()
  if (error || !data) throw error ?? new Error("offering not created")
  return data.id
}

/** Assigns a professor to one edition (replaces the old course-level assignment). */
export async function assignOfferingProfessor(offeringId: string, userId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from("offering_professors")
    .insert({ offering_id: offeringId, user_id: userId })
  if (error) throw error
}

export async function deleteCourses(courseIds: string[]): Promise<void> {
  if (courseIds.length > 0) {
    await supabaseAdmin.from("courses").delete().in("id", courseIds)
  }
}

export interface AssessmentSpec {
  /** Evaluations belong to an edition. */
  offeringId: string
  organizationId: string
  title: string
  kind: Database["public"]["Enums"]["assessment_kind"]
  /** Number of MULTIPLE_CHOICE questions, each worth 1 point with 3 options. */
  multipleChoice?: number
  /** Number of OPEN_ENDED questions, each worth 1 point. */
  openEnded?: number
  durationSeconds?: number | null
  availableFrom?: string | null
  availableUntil?: string | null
  passingScore?: number | null
  maxAttempts?: number | null
  moduleId?: string | null
  status?: Database["public"]["Enums"]["assessment_status"]
  /** TASK only (defaults: 1 file, a deadline a week out, an instruction text, no late submissions). */
  maxFiles?: number
  instructions?: string
  allowLateSubmissions?: boolean
}

const WEEK_MS = 7 * 24 * 60 * 60 * 1000

export interface AssessmentFixture {
  assessmentId: string
  /** Correct option id per question, in the order the questions were created. */
  questions: { questionId: string; correctOptionId: string | null }[]
}

/**
 * Builds a PUBLISHED assessment with its own questions (MC first, then open
 * ended). A TASK gets no questions (the DB refuses them) and the TASK-only
 * columns its shape check requires. Service role throughout: these suites
 * exercise the attempt RPCs, not the authoring write paths.
 */
export async function makeAssessmentFixture(spec: AssessmentSpec): Promise<AssessmentFixture> {
  const isTask = spec.kind === "TASK"
  if (isTask && ((spec.multipleChoice ?? 0) > 0 || (spec.openEnded ?? 0) > 0)) {
    throw new Error("A TASK has no questions; use QUIZ or EXAM for question fixtures")
  }

  const { data: assessment, error: assessmentError } = await supabaseAdmin
    .from("assessments")
    .insert({
      organization_id: spec.organizationId,
      offering_id: spec.offeringId,
      module_id: spec.moduleId ?? null,
      kind: spec.kind,
      status: spec.status ?? "PUBLISHED",
      title: spec.title,
      duration_seconds: spec.durationSeconds ?? null,
      available_from: spec.availableFrom ?? null,
      available_until:
        spec.availableUntil ?? (isTask ? new Date(Date.now() + WEEK_MS).toISOString() : null),
      passing_score: spec.passingScore ?? null,
      max_attempts: isTask ? 1 : (spec.maxAttempts ?? null),
      max_files: isTask ? (spec.maxFiles ?? 1) : null,
      instructions: isTask ? (spec.instructions ?? "Subí tu trabajo en PDF.") : null,
      allow_late_submissions: isTask ? (spec.allowLateSubmissions ?? false) : false,
    })
    .select("id")
    .single()
  if (assessmentError || !assessment) throw assessmentError ?? new Error("assessment not created")

  const questions: AssessmentFixture["questions"] = []
  let position = 0

  for (let i = 0; i < (spec.multipleChoice ?? 0); i++) {
    const { data: question, error } = await supabaseAdmin
      .from("questions")
      .insert({
        assessment_id: assessment.id,
        type: "MULTIPLE_CHOICE",
        prompt: `Pregunta MC ${i + 1}`,
        points: 1,
        position: ++position,
      })
      .select("id")
      .single()
    if (error || !question) throw error ?? new Error("question not created")

    const { data: options } = await supabaseAdmin
      .from("question_options")
      .insert(
        [0, 1, 2].map((n) => ({
          question_id: question.id,
          label: `Opción ${n + 1}`,
          position: n + 1,
          is_correct: n === 0,
        }))
      )
      .select("id, is_correct")
    const correct = (options ?? []).find((o) => o.is_correct)
    questions.push({ questionId: question.id, correctOptionId: correct?.id ?? null })
  }

  for (let i = 0; i < (spec.openEnded ?? 0); i++) {
    const { data: question, error } = await supabaseAdmin
      .from("questions")
      .insert({
        assessment_id: assessment.id,
        type: "OPEN_ENDED",
        prompt: `Pregunta abierta ${i + 1}`,
        points: 1,
        position: ++position,
      })
      .select("id")
      .single()
    if (error || !question) throw error ?? new Error("question not created")
    questions.push({ questionId: question.id, correctOptionId: null })
  }

  return { assessmentId: assessment.id, questions }
}

export interface FixtureCleanup {
  /** Test user ids to remove. */
  users?: string[]
  courseIds?: string[]
}

/**
 * Tears fixtures down in dependency order, and FAILS LOUDLY if it cannot.
 *
 * Order matters and used to be wrong: deleting a course while its attempts
 * still existed hit the `assessment_attempts.assessment_id` RESTRICT FK, the
 * error was discarded, and the course survived. Rows piled up across runs
 * (252 courses) until the shared database was slow enough to make
 * time-sensitive suites fail.
 *
 * Users go first: removing `auth.users` cascades through profiles ->
 * enrollments -> attempts -> attempt questions, which is exactly what the
 * RESTRICT FKs are waiting on. Courses (cascading to assessments and their
 * questions) can then go cleanly.
 */
export async function cleanupFixtures({ users, courseIds }: FixtureCleanup): Promise<void> {
  for (const id of users ?? []) {
    await supabaseAdmin.auth.admin.deleteUser(id)
  }

  if (courseIds && courseIds.length > 0) {
    const { error } = await supabaseAdmin.from("courses").delete().in("id", courseIds)
    if (error) throw new Error(`fixture cleanup failed for courses: ${error.message}`)
  }
}
