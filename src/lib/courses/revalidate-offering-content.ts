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

/** Revalidates an edition's "Exámenes" screens (list, and one exam when given). */
export async function revalidateOfferingExams(offeringId: string, assessmentId?: string) {
  const ctx = await getOfferingContext(offeringId)
  if (!ctx) return
  const teach = `/teach/courses/${ctx.courseId}/editions/${offeringId}/exams`
  const admin = `/admin/courses/${ctx.courseId}/offerings/${offeringId}/exams`
  revalidatePath(teach)
  revalidatePath(admin)
  if (assessmentId) {
    revalidatePath(`${teach}/${assessmentId}`)
    revalidatePath(`${admin}/${assessmentId}`)
  }
}

/** An assessment lives either in the content tree (QUIZ/TASK) or under "Exámenes" (EXAM). */
export async function revalidateAssessment(offeringId: string, kind: "QUIZ" | "TASK" | "EXAM", assessmentId?: string) {
  if (kind === "EXAM") {
    await revalidateOfferingExams(offeringId, assessmentId)
  } else {
    await revalidateOfferingContent(offeringId)
  }
}
