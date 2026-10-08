import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { getCourse } from "@/features/courses/queries/get-course"
import { CourseTabs } from "@/features/courses/components/course-tabs"
import { CourseForm } from "@/features/courses/components/course-form"
import { CourseStatusBadge } from "@/features/courses/components/course-status-badge"
import { PublishDialog } from "@/features/courses/components/publish-dialog"
import { archiveCourse } from "@/features/courses/actions/archive-course"

interface CourseDetailPageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const { courseId } = await params

  const course = await getCourse(courseId)
  if (!course || course.organizationId !== ctx.organizationId) {
    return notFound()
  }

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={course.title}
        breadcrumb={[{ label: courseMessages.list.title, href: "/admin/courses" }, { label: course.title }]}
        description={courseMessages.access[course.accessType]}
      >
        <div className="flex items-center gap-2">
          <CourseStatusBadge status={course.status} />
          <CourseForm
            mode="edit"
            course={course}
            trigger={<Button variant="outline">{messages.common.edit}</Button>}
          />
        </div>
      </PageHeader>

      <CourseTabs courseId={courseId} active="detalle" />

      <section className="flex flex-col gap-4 rounded-lg border p-4">
        <p className="text-sm text-muted-foreground">{course.description || "—"}</p>

        <div className="flex flex-wrap gap-2">
          {course.status === "DRAFT" && (
            <PublishDialog courseId={course.id} trigger={<Button>{courseMessages.detail.publishAction}</Button>} />
          )}
          {course.status === "PUBLISHED" && (
            <ConfirmDialog
              trigger={<Button variant="outline">{courseMessages.detail.archiveAction}</Button>}
              title={courseMessages.archive.title}
              description={courseMessages.archive.description}
              confirmLabel={courseMessages.archive.confirmLabel}
              successMessage={courseMessages.archive.success}
              action={archiveCourse}
              input={{ courseId: course.id }}
            />
          )}
        </div>
      </section>
    </div>
  )
}
