import { resolveEditableFirstEdition } from "@/lib/courses/resolve-editable-offering"
import { ModuleListPage } from "@/features/modules/components/module-list-page"

interface TeachCourseContentPageProps {
  params: Promise<{ courseId: string }>
}

/** PROFESSOR guard + `canEditCourse` — level 1 of the content drill-down (modules). */
export default async function TeachCourseContentPage({ params }: TeachCourseContentPageProps) {
  const { courseId } = await params
  const tree = await resolveEditableFirstEdition(courseId, ["PROFESSOR"])

  return (
    <ModuleListPage
      tree={tree}
      canEdit
      basePath={`/teach/courses/${courseId}/content`}
      coursesHref="/teach/courses"
      assessmentsHref={`/teach/courses/${courseId}/assessments`}
    />
  )
}
