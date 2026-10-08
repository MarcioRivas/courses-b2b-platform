import { findLessonOr404, findModuleOr404, resolveEditableFirstEdition } from "@/lib/courses/resolve-editable-offering"
import { LessonDetailPage } from "@/features/lessons/components/lesson-detail-page"

interface AdminLessonPageProps {
  params: Promise<{ courseId: string; moduleId: string; lessonId: string }>
}

/** ADMIN guard + `canEditCourse` — level 3 of the content drill-down (blocks of a lesson). */
export default async function AdminLessonPage({ params }: AdminLessonPageProps) {
  const { courseId, moduleId, lessonId } = await params
  const tree = await resolveEditableFirstEdition(courseId, ["ADMIN"])
  const courseModule = findModuleOr404(tree, moduleId)
  const lesson = findLessonOr404(courseModule, lessonId)

  return (
    <LessonDetailPage
      tree={tree}
      module={courseModule}
      lesson={lesson}
      canEdit
      basePath={`/admin/courses/${courseId}/content`}
      coursesHref="/admin/courses"
    />
  )
}
