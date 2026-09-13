import Link from "next/link"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Button } from "@/components/ui/button"
import { courseMessages } from "@/lib/messages/admin-courses"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { listProfessorCourses } from "@/features/courses/queries/list-professor-courses"
import { CourseStatusBadge } from "@/features/courses/components/course-status-badge"
import type { ProfessorCourseListItem } from "@/features/courses/types"

export default async function TeachCoursesPage() {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const courses = await listProfessorCourses(ctx.user.id)

  const titleColumn: DataListColumn<ProfessorCourseListItem> = {
    key: "title",
    header: courseMessages.list.titleHeader,
    cell: (course) => course.title,
  }

  const columns: DataListColumn<ProfessorCourseListItem>[] = [
    {
      key: "status",
      header: courseMessages.list.statusHeader,
      cell: (course) => <CourseStatusBadge status={course.status} />,
    },
    {
      key: "access",
      header: courseMessages.list.accessHeader,
      cell: (course) => courseMessages.access[course.accessType],
    },
    {
      key: "actions",
      header: courseMessages.detail.contentTab,
      isActions: true,
      cell: (course) => (
        <div className="flex items-center gap-1.5">
          <Button variant="outline" size="sm" render={<Link href={`/teach/courses/${course.id}/content`} />}>
            {courseMessages.detail.contentTab}
          </Button>
          <Button variant="outline" size="sm" render={<Link href={`/teach/courses/${course.id}/assessments`} />}>
            {teachAssessmentMessages.nav.assessments}
          </Button>
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={courseMessages.teach.title} />
      <DataList
        items={courses}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(course) => course.id}
        emptyTitle={courseMessages.teach.emptyTitle}
      />
    </div>
  )
}
