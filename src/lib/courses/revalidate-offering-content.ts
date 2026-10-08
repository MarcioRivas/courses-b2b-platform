import "server-only"

import { revalidatePath } from "next/cache"
import { getOfferingContext } from "./get-offering-context"

/**
 * Revalidates an edition's content drill-down (admin + teach). `"layout"`
 * covers the nested `/content/[moduleId]` and `/content/[moduleId]/[lessonId]`
 * routes explicitly, instead of relying on the current-route re-render side
 * effect.
 */
export async function revalidateOfferingContent(offeringId: string) {
  const ctx = await getOfferingContext(offeringId)
  if (!ctx) return
  revalidatePath(`/admin/courses/${ctx.courseId}/offerings/${offeringId}/content`, "layout")
  revalidatePath(`/teach/courses/${ctx.courseId}/editions/${offeringId}/content`, "layout")
}

/** Revalidates an edition's evaluation screens (list, and one evaluation when given). */
export async function revalidateOfferingAssessments(offeringId: string, assessmentId?: string) {
  const ctx = await getOfferingContext(offeringId)
  if (!ctx) return
  const teach = `/teach/courses/${ctx.courseId}/editions/${offeringId}/assessments`
  const admin = `/admin/courses/${ctx.courseId}/offerings/${offeringId}/assessments`
  revalidatePath(teach)
  revalidatePath(admin)
  if (assessmentId) {
    revalidatePath(`${teach}/${assessmentId}`)
  }
}
