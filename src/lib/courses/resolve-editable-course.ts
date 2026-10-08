import "server-only"

import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { MembershipRole } from "@/lib/auth/session"
import { canEditCourse } from "@/lib/auth/course-access"
import {
  getCourseTree,
  type CourseTree,
  type CourseTreeLesson,
  type CourseTreeModule,
} from "@/features/courses/queries/get-course-tree"

/**
 * Shared guard for the content builder routes (`/admin` + `/teach`,
 * `…/content`, `…/content/[moduleId]`, `…/content/[moduleId]/[lessonId]`):
 * role gate → `can_edit_course_content` → tree, `notFound()` when either fails.
 */
export async function resolveEditableCourse(courseId: string, roles: MembershipRole[]): Promise<CourseTree> {
  await requireOrgRole(roles)

  if (!(await canEditCourse(courseId))) {
    notFound()
  }

  const tree = await getCourseTree(courseId)
  if (!tree) {
    notFound()
  }
  return tree
}

/** Module lookup by id inside an already-resolved tree; 404 keeps deep links honest. */
export function findModuleOr404(tree: CourseTree, moduleId: string): CourseTreeModule {
  const courseModule = tree.modules.find((m) => m.id === moduleId)
  if (!courseModule) {
    notFound()
  }
  return courseModule
}

export function findLessonOr404(module: CourseTreeModule, lessonId: string): CourseTreeLesson {
  const lesson = module.lessons.find((l) => l.id === lessonId)
  if (!lesson) {
    notFound()
  }
  return lesson
}
