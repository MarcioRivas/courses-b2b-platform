import { createClient } from "@/lib/supabase/server"
import type { Database, Json } from "@/types/database.types"

type ContentBlockType = Database["public"]["Enums"]["content_block_type"]
type AssessmentKind = Database["public"]["Enums"]["assessment_kind"]

export interface StudentBlock {
  id: string
  type: ContentBlockType
  position: number
  data: Json
  isRequired: boolean
  completed: boolean
  /** Only set for QUIZ/TASK blocks (Phase 5, D33) — `null` for every other type. */
  assessmentId: string | null
  /**
   * Title/kind of the linked assessment, read through the student-readable
   * `assessments_select` RLS policy (published + course-visible). `null` when
   * the block references an assessment the student cannot see yet (e.g. still
   * DRAFT) — the player hides the card rather than showing broken data.
   */
  assessment: { title: string; kind: AssessmentKind } | null
}

export interface StudentLesson {
  id: string
  title: string
  description: string | null
  position: number
  blocks: StudentBlock[]
}

export interface StudentModule {
  id: string
  title: string
  description: string | null
  position: number
  lessons: StudentLesson[]
}

/**
 * The student's view of a course: modules → lessons → blocks, each block
 * carrying whether this enrollment has already completed it.
 *
 * Availability is deliberately absent — it is decided by `module_unlock_state`
 * and merged in the page (D17). This query only reports what exists.
 */
export async function getEnrollmentCourseTree(
  courseId: string,
  enrollmentId: string
): Promise<StudentModule[]> {
  const supabase = await createClient()

  const [{ data: modules }, { data: progress }] = await Promise.all([
    supabase
      .from("modules")
      .select(
        `id, title, description, position,
         lessons ( id, title, description, position,
           lesson_content_blocks ( id, type, position, data, is_required, assessment_id,
             assessments ( title, kind ) ) )`
      )
      .eq("course_id", courseId)
      .order("position", { ascending: true }),
    supabase.from("content_progress").select("content_block_id").eq("enrollment_id", enrollmentId),
  ])

  const completed = new Set((progress ?? []).map((row) => row.content_block_id))
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

  return (modules ?? []).map((module) => ({
    id: module.id,
    title: module.title,
    description: module.description,
    position: module.position,
    lessons: [...(module.lessons ?? [])].sort(byPosition).map((lesson) => ({
      id: lesson.id,
      title: lesson.title,
      description: lesson.description,
      position: lesson.position,
      blocks: [...(lesson.lesson_content_blocks ?? [])].sort(byPosition).map((block) => ({
        id: block.id,
        type: block.type,
        position: block.position,
        data: block.data,
        isRequired: block.is_required,
        completed: completed.has(block.id),
        assessmentId: block.assessment_id,
        assessment: block.assessments ? { title: block.assessments.title, kind: block.assessments.kind } : null,
      })),
    })),
  }))
}
