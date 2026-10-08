import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { courseMessages } from "@/lib/messages/admin-courses"
import { getCourse } from "@/features/courses/queries/get-course"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { CourseTabs } from "@/features/courses/components/course-tabs"
import { OfferingList } from "@/features/offerings/components/offering-list"

interface CourseOfferingsPageProps {
  params: Promise<{ courseId: string }>
}

export default async function CourseOfferingsPage({ params }: CourseOfferingsPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const { courseId } = await params

  const course = await getCourse(courseId)
  if (!course || course.organizationId !== ctx.organizationId) {
    return notFound()
  }

  const settings = await getOrgSettings(ctx.organizationId)
  const basePath = `/admin/courses/${courseId}`

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={course.title}
        breadcrumb={[{ label: courseMessages.list.title, href: "/admin/courses" }, { label: course.title }]}
      />

      <CourseTabs courseId={courseId} active="ediciones" />

      <OfferingList
        courseId={courseId}
        courseAccessType={course.accessType}
        organizationId={ctx.organizationId}
        timeZone={settings?.timezone ?? DEFAULT_TIME_ZONE}
        basePath={`${basePath}/offerings`}
      />
    </div>
  )
}
