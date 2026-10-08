import { findLessonOr404, findModuleOr404, resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { editionCrumbs, editionPaths } from "@/lib/courses/edition-paths"
import { LessonDetailPage } from "@/features/lessons/components/lesson-detail-page"

interface AdminLessonPageProps {
  params: Promise<{ courseId: string; offeringId: string; moduleId: string; lessonId: string }>
}

/** ADMIN guard + `can_edit_offering` — level 3 of the content drill-down (blocks of a lesson). */
export default async function AdminLessonPage({ params }: AdminLessonPageProps) {
  const { courseId, offeringId, moduleId, lessonId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["ADMIN"])
  const courseModule = findModuleOr404(tree, moduleId)
  const lesson = findLessonOr404(courseModule, lessonId)

  return (
    <LessonDetailPage
      tree={tree}
      module={courseModule}
      lesson={lesson}
      canEdit
      basePath={editionPaths("admin", tree).content}
      breadcrumb={editionCrumbs("admin", { ...tree, courseTitle: tree.title })}
    />
  )
}
