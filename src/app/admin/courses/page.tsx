import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { CourseList } from "@/features/courses/components/course-list"
import { courseMessages } from "@/lib/messages/admin-courses"
import type { SearchParams } from "@/lib/search-params"

interface CoursesPageProps {
  searchParams: Promise<SearchParams>
}

export default async function CoursesPage({ searchParams }: CoursesPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const sp = await searchParams

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={courseMessages.list.title} />
      <CourseList organizationId={ctx.organizationId} basePath="/admin/courses" searchParams={sp} />
    </div>
  )
}
