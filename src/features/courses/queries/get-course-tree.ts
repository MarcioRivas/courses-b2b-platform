import { createClient } from "@/lib/supabase/server"
import type { Database, Json } from "@/types/database.types"

/**
 * Self-contained tree fetch for the content builder (Part B). Deliberately
 * does not import anything else from `src/features/courses/**` (owned by
 * Part A) — only the generated database types and the server Supabase client.
 */

type ContentBlockType = Database["public"]["Enums"]["content_block_type"]
type DependencyCondition = Database["public"]["Enums"]["dependency_condition"]
type CourseStatus = Database["public"]["Enums"]["course_status"]

export interface CourseTreeBlock {
  id: string
  type: ContentBlockType
  position: number
  data: Json
  isRequired: boolean
}

export interface CourseTreeLesson {
  id: string
  title: string
  description: string | null
  position: number
  blocks: CourseTreeBlock[]
}

export interface CourseTreeDependency {
  id: string
  condition: DependencyCondition
  dependsOnModuleId: string | null
  assessmentId: string | null
  minScore: number | null
}

export interface CourseTreeModule {
  id: string
  title: string
  description: string | null
  position: number
  lessons: CourseTreeLesson[]
  dependencies: CourseTreeDependency[]
}

export interface CourseTree {
  courseId: string
  organizationId: string
  title: string
  status: CourseStatus
  modules: CourseTreeModule[]
}

export async function getCourseTree(courseId: string): Promise<CourseTree | null> {
  const supabase = await createClient()

  const { data: course } = await supabase
    .from("courses")
    .select("id, organization_id, title, status")
    .eq("id", courseId)
    .maybeSingle()

  if (!course) {
    return null
  }

  const { data: modules } = await supabase
    .from("modules")
    .select(
      `id, title, description, position,
       lessons ( id, title, description, position,
         lesson_content_blocks ( id, type, position, data, is_required ) ),
       module_dependencies!module_dependencies_module_id_fkey ( id, condition, depends_on_module_id, assessment_id, min_score )`
    )
    .eq("course_id", courseId)
    .order("position", { ascending: true })

  // Embedded resources are not guaranteed ordered by the top-level `.order()`
  // call, so nested arrays are sorted here by `position` explicitly.
  const byPosition = <T extends { position: number }>(a: T, b: T) => a.position - b.position

  return {
    courseId: course.id,
    organizationId: course.organization_id,
    title: course.title,
    status: course.status,
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
