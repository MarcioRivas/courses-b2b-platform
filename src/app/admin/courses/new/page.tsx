import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { CourseForm } from "@/features/courses/components/course-form"
import { courseMessages } from "@/lib/messages/admin-courses"

export default async function NewCoursePage() {
  await requireOrgRole(["ADMIN"])

  return (
    <div className="flex max-w-md flex-col gap-4">
      <PageHeader title={courseMessages.form.createTitle} />
      <CourseForm mode="create" variant="inline" />
    </div>
  )
}
