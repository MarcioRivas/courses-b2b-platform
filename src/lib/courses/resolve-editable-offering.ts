import "server-only"

import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import type { MembershipRole } from "@/lib/auth/session"
import { canEditOffering } from "@/lib/auth/course-access"
import {
  getOfferingTree,
  type OfferingTree,
  type OfferingTreeLesson,
  type OfferingTreeModule,
} from "@/features/courses/queries/get-offering-tree"

/**
 * Shared guard for the content builder routes (`/admin` + `/teach`,
 * `…/content`, `…/content/[moduleId]`, `…/content/[moduleId]/[lessonId]`):
 * role gate → `can_edit_offering` → tree (+ edition belongs to course), `notFound()` when any fails.
 */
export async function resolveEditableOffering(
  courseId: string,
  offeringId: string,
  roles: MembershipRole[]
): Promise<OfferingTree> {
  await requireOrgRole(roles)

  if (!(await canEditOffering(offeringId))) {
    notFound()
  }

  const tree = await getOfferingTree(offeringId)
  // The edition must belong to the course in the URL, otherwise 404.
  if (!tree || tree.courseId !== courseId) {
    notFound()
  }
  return tree
}

/** Module lookup by id inside an already-resolved tree; 404 keeps deep links honest. */
export function findModuleOr404(tree: OfferingTree, moduleId: string): OfferingTreeModule {
  const courseModule = tree.modules.find((m) => m.id === moduleId)
  if (!courseModule) {
    notFound()
  }
  return courseModule
}

export function findLessonOr404(module: OfferingTreeModule, lessonId: string): OfferingTreeLesson {
  const lesson = module.lessons.find((l) => l.id === lessonId)
  if (!lesson) {
    notFound()
  }
  return lesson
}
