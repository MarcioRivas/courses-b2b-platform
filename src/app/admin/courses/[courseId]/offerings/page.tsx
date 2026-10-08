import Link from "next/link"
import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { cn } from "@/lib/utils"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { courseMessages } from "@/lib/messages/admin-courses"
import { getCourse } from "@/features/courses/queries/get-course"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { OfferingList } from "@/features/offerings/components/offering-list"

interface CourseOfferingsPageProps {
  params: Promise<{ courseId: string }>
}

const TABS = [
  { key: "detalle", label: courseMessages.detail.detailTab, segment: "" },
  { key: "profesores", label: courseMessages.detail.professorsTab, segment: "professors" },
  { key: "ediciones", label: courseMessages.detail.offeringsTab, segment: "offerings" },
  { key: "contenido", label: courseMessages.detail.contentTab, segment: "content" },
] as const

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
      <PageHeader title={course.title} />

      <nav className="flex gap-1 border-b" aria-label={courseMessages.detail.offeringsTab}>
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.segment ? `${basePath}/${tab.segment}` : basePath}
            aria-current={tab.key === "ediciones" ? "page" : undefined}
            className={cn(
              "-mb-px border-b-2 px-3 py-2 text-sm font-medium",
              tab.key === "ediciones"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

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
