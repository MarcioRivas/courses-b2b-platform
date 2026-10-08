import Link from "next/link"
import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { getCourse } from "@/features/courses/queries/get-course"
import { CourseForm } from "@/features/courses/components/course-form"
import { CourseStatusBadge } from "@/features/courses/components/course-status-badge"
import { PublishDialog } from "@/features/courses/components/publish-dialog"
import { archiveCourse } from "@/features/courses/actions/archive-course"

interface CourseDetailPageProps {
  params: Promise<{ courseId: string }>
}

const TABS = [
  { key: "detalle", label: courseMessages.detail.detailTab, segment: "" },
  { key: "profesores", label: courseMessages.detail.professorsTab, segment: "professors" },
  { key: "ediciones", label: courseMessages.detail.offeringsTab, segment: "offerings" },
  { key: "contenido", label: courseMessages.detail.contentTab, segment: "content" },
] as const

export default async function CourseDetailPage({ params }: CourseDetailPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const { courseId } = await params

  const course = await getCourse(courseId)
  if (!course || course.organizationId !== ctx.organizationId) {
    return notFound()
  }

  const basePath = `/admin/courses/${courseId}`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={course.title} description={courseMessages.access[course.accessType]}>
        <div className="flex items-center gap-2">
          <CourseStatusBadge status={course.status} />
          <CourseForm
            mode="edit"
            course={course}
            trigger={<Button variant="outline">{messages.common.edit}</Button>}
          />
        </div>
      </PageHeader>

      <nav className="flex gap-1 border-b" aria-label={courseMessages.detail.detailTab}>
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.segment ? `${basePath}/${tab.segment}` : basePath}
            aria-current={tab.key === "detalle" ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab.key === "detalle"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

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
