import { findLessonOr404, findModuleOr404, resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { editionCrumbs, editionPaths } from "@/lib/courses/edition-paths"
import { LessonDetailPage } from "@/features/lessons/components/lesson-detail-page"

interface TeachLessonPageProps {
  params: Promise<{ courseId: string; offeringId: string; moduleId: string; lessonId: string }>
}

/** PROFESSOR guard + `can_edit_offering` — level 3 of the content drill-down (blocks of a lesson). */
export default async function TeachLessonPage({ params }: TeachLessonPageProps) {
  const { courseId, offeringId, moduleId, lessonId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])
  const courseModule = findModuleOr404(tree, moduleId)
  const lesson = findLessonOr404(courseModule, lessonId)

  return (
    <LessonDetailPage
      tree={tree}
      module={courseModule}
      lesson={lesson}
      canEdit
      basePath={editionPaths("teach", tree).content}
      breadcrumb={editionCrumbs("teach", { ...tree, courseTitle: tree.title })}
    />
  )
}
