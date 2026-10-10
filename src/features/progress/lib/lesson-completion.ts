import type { StudentLesson, StudentModule } from "@/features/enrollments/queries/get-enrollment-course-tree"

/** A lesson is complete once every required block is; a lesson with none never counts as done. */
export function isLessonComplete(lesson: StudentLesson): boolean {
  const required = lesson.blocks.filter((block) => block.isRequired)
  return required.length > 0 && required.every((block) => block.completed)
}

/**
 * Every lesson that has required content is complete (lessons without any don't block it).
 * Deliberately stricter than the server's `is_done` for a module with no required content
 * (never "complete" here): it only drives the celebration banner, which needs a completed
 * lesson anyway, so the two can't visibly disagree.
 */
export function isModuleComplete(courseModule: StudentModule): boolean {
  const gradedLessons = courseModule.lessons.filter((lesson) => lesson.blocks.some((block) => block.isRequired))
  return gradedLessons.length > 0 && gradedLessons.every(isLessonComplete)
}

/** Required blocks done / total for one lesson (drives the lesson header's progress bar). */
export function lessonProgress(lesson: StudentLesson): { completed: number; total: number; percent: number } {
  const required = lesson.blocks.filter((block) => block.isRequired)
  const completed = required.filter((block) => block.completed).length
  const total = required.length
  return { completed, total, percent: total === 0 ? 0 : (completed / total) * 100 }
}
