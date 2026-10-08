import "server-only"

import { notFound } from "next/navigation"
import { createClient } from "@/lib/supabase/server"
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
 * role gate → `can_edit_offering` → tree, `notFound()` when either fails.
 */
export async function resolveEditableOffering(offeringId: string, roles: MembershipRole[]): Promise<OfferingTree> {
  await requireOrgRole(roles)

  if (!(await canEditOffering(offeringId))) {
    notFound()
  }

  const tree = await getOfferingTree(offeringId)
  if (!tree) {
    notFound()
  }
  return tree
}

/**
 * TEMPORARY bridge (B2 step 1): the old course-level builder routes still exist
 * until the content moves under `/offerings/[offeringId]` and
 * `/editions/[offeringId]` (step 2), so they serve the first edition the caller
 * can see. Delete together with those routes.
 */
export async function firstVisibleOfferingId(courseId: string): Promise<string | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from("course_offerings")
    .select("id")
    .eq("course_id", courseId)
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(1)
    .maybeSingle()
  return data?.id ?? null
}

export async function resolveEditableFirstEdition(courseId: string, roles: MembershipRole[]): Promise<OfferingTree> {
  const offeringId = await firstVisibleOfferingId(courseId)
  if (!offeringId) {
    notFound()
  }
  return resolveEditableOffering(offeringId, roles)
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
