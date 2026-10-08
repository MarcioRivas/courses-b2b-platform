import { createClient } from "@/lib/supabase/server"
import type { Database, Json } from "@/types/database.types"

/**
 * Self-contained tree fetch for the content builder of ONE edition (B2). Deliberately
 * does not import anything else from `src/features/courses/**` (owned by
 * Part A) — only the generated database types and the server Supabase client.
 */

type ContentBlockType = Database["public"]["Enums"]["content_block_type"]
type DependencyCondition = Database["public"]["Enums"]["dependency_condition"]
type CourseStatus = Database["public"]["Enums"]["course_status"]

export interface OfferingTreeBlock {
  id: string
  type: ContentBlockType
  position: number
  data: Json
  isRequired: boolean
  /** YOUTUBE_VIDEO only: in-video checkpoints (0 for other types; RLS shows them to editors only). */
  checkpointCount: number
}

export interface OfferingTreeLesson {
  id: string
  title: string
  description: string | null
  position: number
  blocks: OfferingTreeBlock[]
}

export interface OfferingTreeDependency {
  id: string
  condition: DependencyCondition
  dependsOnModuleId: string | null
  assessmentId: string | null
  minScore: number | null
}

export interface OfferingTreeModule {
  id: string
  title: string
  description: string | null
  position: number
  lessons: OfferingTreeLesson[]
  dependencies: OfferingTreeDependency[]
}

export interface OfferingTree {
  courseId: string
  offeringId: string
  organizationId: string
  /** Course title. */
  title: string
  /** Edition name. */
  offeringName: string
  status: CourseStatus
  modules: OfferingTreeModule[]
}

export async function getOfferingTree(offeringId: string): Promise<OfferingTree | null> {
  const supabase = await createClient()

  const { data: offering } = await supabase
    .from("course_offerings")
    .select("id, name, course_id, organization_id, courses ( title, status )")
    .eq("id", offeringId)
    .maybeSingle()

  if (!offering || !offering.courses) {
    return null
  }

  const { data: modules } = await supabase
    .from("modules")
    .select(
      `id, title, description, position,
       lessons ( id, title, description, position,
         lesson_content_blocks ( id, type, position, data, is_required, video_checkpoints ( count ) ) ),
       module_dependencies!module_dependencies_module_id_fkey ( id, condition, depends_on_module_id, assessment_id, min_score )`
    )
    .eq("offering_id", offeringId)
    .order("position", { ascending: true })

  // Embedded resources are not guaranteed ordered by the top-level `.order()`
  // call, so nested arrays are sorted here by `position` explicitly.
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

  return {
    courseId: offering.course_id,
    offeringId: offering.id,
    organizationId: offering.organization_id,
    title: offering.courses.title,
    offeringName: offering.name,
    status: offering.courses.status,
    modules: (modules ?? []).map((module) => ({
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
          checkpointCount: block.video_checkpoints?.[0]?.count ?? 0,
        })),
      })),
      dependencies: (module.module_dependencies ?? []).map((dependency) => ({
        id: dependency.id,
        condition: dependency.condition,
        dependsOnModuleId: dependency.depends_on_module_id,
        assessmentId: dependency.assessment_id,
        minScore: dependency.min_score,
      })),
    })),
  }
}
