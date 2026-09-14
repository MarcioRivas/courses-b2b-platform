import { revalidatePath } from "next/cache"

/**
 * Revalidates the course content drill-down (admin + teach) for a course.
 * `"layout"` covers the nested `/content/[moduleId]` and `/content/[moduleId]/[lessonId]`
 * routes explicitly, instead of relying on the current-route re-render side effect.
 */
export function revalidateCourseContent(courseId: string) {
  revalidatePath(`/admin/courses/${courseId}/content`, "layout")
  revalidatePath(`/teach/courses/${courseId}/content`, "layout")
}
