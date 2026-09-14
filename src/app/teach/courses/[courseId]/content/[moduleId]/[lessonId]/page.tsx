import { findLessonOr404, findModuleOr404, resolveEditableCourse } from "@/lib/courses/resolve-editable-course"
import { LessonDetailPage } from "@/features/lessons/components/lesson-detail-page"

interface TeachLessonPageProps {
  params: Promise<{ courseId: string; moduleId: string; lessonId: string }>
}

/** PROFESSOR guard + `canEditCourse` — level 3 of the content drill-down (blocks of a lesson). */
export default async function TeachLessonPage({ params }: TeachLessonPageProps) {
  const { courseId, moduleId, lessonId } = await params
  const tree = await resolveEditableCourse(courseId, ["PROFESSOR"])
  const courseModule = findModuleOr404(tree, moduleId)
  const lesson = findLessonOr404(courseModule, lessonId)

  return (
    <LessonDetailPage
      tree={tree}
      module={courseModule}
      lesson={lesson}
      canEdit
      basePath={`/teach/courses/${courseId}/content`}
      coursesHref="/teach/courses"
    />
  )
}
