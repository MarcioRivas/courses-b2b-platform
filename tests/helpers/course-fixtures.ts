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
 * Builds course → module → lesson → blocks → OPEN offering with the service
 * role. Deliberately bypasses the authoring RPCs: these suites exercise the
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

  const modules: CourseFixture["modules"] = []

  for (const [index, spec] of options.modules.entries()) {
    const { data: module } = await supabaseAdmin
      .from("modules")
      .insert({ course_id: course.id, title: spec.title, position: index + 1 })
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

export async function deleteCourses(courseIds: string[]): Promise<void> {
  if (courseIds.length > 0) {
    await supabaseAdmin.from("courses").delete().in("id", courseIds)
  }
}

export interface AssessmentSpec {
  courseId: string
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
}

export interface AssessmentFixture {
  assessmentId: string
  bankId: string
  /** Correct option id per question, in the order the questions were created. */
  questions: { questionId: string; correctOptionId: string | null }[]
}

/**
 * Builds a bank + questions + a PUBLISHED assessment with a fixed question
 * list. Service role throughout: these suites exercise the attempt RPCs, not
 * the authoring write paths.
 */
export async function makeAssessmentFixture(spec: AssessmentSpec): Promise<AssessmentFixture> {
  const { data: bank, error: bankError } = await supabaseAdmin
    .from("question_banks")
    .insert({ organization_id: spec.organizationId, course_id: spec.courseId, name: `${spec.title} — banco` })
    .select("id")
    .single()
  if (bankError || !bank) throw bankError ?? new Error("bank not created")

  const questions: AssessmentFixture["questions"] = []

  for (let i = 0; i < (spec.multipleChoice ?? 0); i++) {
    const { data: question } = await supabaseAdmin
      .from("questions")
      .insert({
        question_bank_id: bank.id,
        organization_id: spec.organizationId,
        type: "MULTIPLE_CHOICE",
        prompt: `Pregunta MC ${i + 1}`,
        default_points: 1,
      })
      .select("id")
      .single()
    if (!question) throw new Error("question not created")

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
    const { data: question } = await supabaseAdmin
      .from("questions")
      .insert({
        question_bank_id: bank.id,
        organization_id: spec.organizationId,
        type: "OPEN_ENDED",
        prompt: `Pregunta abierta ${i + 1}`,
        default_points: 1,
      })
      .select("id")
      .single()
    if (!question) throw new Error("question not created")
    questions.push({ questionId: question.id, correctOptionId: null })
  }

  const { data: assessment, error: assessmentError } = await supabaseAdmin
    .from("assessments")
    .insert({
      organization_id: spec.organizationId,
      course_id: spec.courseId,
      module_id: spec.moduleId ?? null,
      kind: spec.kind,
      status: spec.status ?? "PUBLISHED",
      title: spec.title,
      duration_seconds: spec.durationSeconds ?? null,
      available_from: spec.availableFrom ?? null,
      available_until: spec.availableUntil ?? null,
      passing_score: spec.passingScore ?? null,
      max_attempts: spec.maxAttempts ?? null,
    })
    .select("id")
    .single()
  if (assessmentError || !assessment) throw assessmentError ?? new Error("assessment not created")

  if (questions.length > 0) {
    const { error } = await supabaseAdmin.from("assessment_questions").insert(
      questions.map((q, index) => ({
        assessment_id: assessment.id,
        question_id: q.questionId,
        position: index + 1,
        points: 1,
      }))
    )
    if (error) throw error
  }

  return { assessmentId: assessment.id, bankId: bank.id, questions }
}

/** Deleting the bank cascades to questions and options. */
export async function deleteBanks(bankIds: string[]): Promise<void> {
  if (bankIds.length > 0) {
    await supabaseAdmin.from("question_banks").delete().in("id", bankIds)
  }
}

export interface FixtureCleanup {
  /** Test user ids to remove. */
  users?: string[]
  courseIds?: string[]
  bankIds?: string[]
}

/**
 * Tears fixtures down in dependency order, and FAILS LOUDLY if it cannot.
 *
 * Order matters and used to be wrong: deleting a course while its attempts
 * still existed hit the `assessment_attempts.assessment_id` RESTRICT FK, the
 * error was discarded, and the course survived. Rows piled up across runs
 * (252 courses, 140 banks) until the shared database was slow enough to make
 * time-sensitive suites fail.
 *
 * Users go first: removing `auth.users` cascades through profiles ->
 * enrollments -> attempts -> attempt questions, which is exactly what the
 * RESTRICT FKs are waiting on. Courses and banks can then go cleanly.
 */
export async function cleanupFixtures({ users, courseIds, bankIds }: FixtureCleanup): Promise<void> {
  for (const id of users ?? []) {
    await supabaseAdmin.auth.admin.deleteUser(id)
  }

  if (courseIds && courseIds.length > 0) {
    const { error } = await supabaseAdmin.from("courses").delete().in("id", courseIds)
    if (error) throw new Error(`fixture cleanup failed for courses: ${error.message}`)
  }

  if (bankIds && bankIds.length > 0) {
    const { error } = await supabaseAdmin.from("question_banks").delete().in("id", bankIds)
    if (error) throw new Error(`fixture cleanup failed for banks: ${error.message}`)
  }
}
