import Link from "next/link"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Button } from "@/components/ui/button"
import { courseMessages } from "@/lib/messages/admin-courses"
import { editionPaths } from "@/lib/courses/edition-paths"
import { listProfessorEditions } from "@/features/courses/queries/list-professor-courses"
import { CourseStatusBadge } from "@/features/courses/components/course-status-badge"
import type { ProfessorEditionListItem } from "@/features/courses/types"

export default async function TeachCoursesPage() {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const editions = await listProfessorEditions(ctx.user.id)

  const titleColumn: DataListColumn<ProfessorEditionListItem> = {
    key: "title",
    header: courseMessages.list.titleHeader,
    cell: (item) => `${item.courseTitle} · ${item.offeringName}`,
  }

  const columns: DataListColumn<ProfessorEditionListItem>[] = [
    {
      key: "status",
      header: courseMessages.list.statusHeader,
      cell: (item) => <CourseStatusBadge status={item.courseStatus} />,
    },
    {
      key: "access",
      header: courseMessages.list.accessHeader,
      cell: (item) => courseMessages.access[item.accessType],
    },
    {
      key: "actions",
      header: "",
      isActions: true,
      cell: (item) => (
        <Button
          variant="outline"
          size="sm"
          render={<Link href={editionPaths("teach", item).content} />}
        >
          {courseMessages.list.viewAction}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={courseMessages.teach.title} />
      <DataList
        items={editions}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(item) => item.offeringId}
        emptyTitle={courseMessages.teach.emptyTitle}
      />
    </div>
  )
}
