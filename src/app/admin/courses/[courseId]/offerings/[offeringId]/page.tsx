import Link from "next/link"
import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { getCourse } from "@/features/courses/queries/get-course"
import { getOffering } from "@/features/offerings/queries/get-offering"
import { getOfferingSchedule } from "@/features/offerings/queries/get-offering-schedule"
import { listOrgGroups } from "@/features/offerings/queries/list-org-groups"
import { OfferingTabs } from "@/features/offerings/components/offering-tabs"
import { OfferingForm } from "@/features/offerings/components/offering-form"
import { ModuleScheduleEditor } from "@/features/offerings/components/module-schedule-editor"
import { EnrollmentSummary } from "@/features/offerings/components/enrollment-summary"
import { OfferingStatusControl } from "./_components/offering-status-control"

interface OfferingDetailPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
  searchParams: Promise<{ copied?: string }>
}

export default async function OfferingDetailPage({ params, searchParams }: OfferingDetailPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const { courseId, offeringId } = await params
  const { copied } = await searchParams

  const offering = await getOffering(offeringId)
  if (!offering || offering.organizationId !== ctx.organizationId || offering.courseId !== courseId) {
    return notFound()
  }

  const course = await getCourse(courseId)
  if (!course) {
    return notFound()
  }

  const [settings, schedule, groups] = await Promise.all([
    getOrgSettings(ctx.organizationId),
    getOfferingSchedule(offeringId),
    listOrgGroups(ctx.organizationId),
  ])
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={offering.name}
        description={course.title}
        breadcrumb={[
          { label: courseMessages.list.title, href: "/admin/courses" },
          { label: course.title, href: `/admin/courses/${courseId}` },
          { label: offeringMessages.list.title, href: `/admin/courses/${courseId}/offerings` },
          { label: offering.name },
        ]}
      >
        <div className="flex items-center gap-2">
          <OfferingStatusControl offeringId={offering.id} status={offering.status} />
          {offering.kind === "GROUP" && (
            <OfferingForm
              mode="edit"
              courseId={courseId}
              courseAccessType={course.accessType}
              groups={groups}
              timeZone={timeZone}
              offering={offering}
              trigger={<Button variant="outline">{messages.common.edit}</Button>}
            />
          )}
        </div>
      </PageHeader>

      <OfferingTabs courseId={courseId} offeringId={offeringId} active="detalle" />

      {copied === "1" && (
        <Alert>
          <AlertDescription>{offeringMessages.copiedHint}</AlertDescription>
        </Alert>
      )}

      <section className="flex flex-col gap-1 rounded-lg border p-4 text-sm">
        <h2 className="font-medium">{offeringMessages.detail.groupLabel}</h2>
        {offering.groupId ? (
          <Link href={`/admin/groups/${offering.groupId}`} className="w-fit font-medium text-primary hover:underline">
            {offering.groupName}
          </Link>
        ) : (
          <p className="text-muted-foreground">{offeringMessages.detail.noGroup}</p>
        )}
      </section>

      <EnrollmentSummary
        offeringId={offering.id}
        enrolledCount={offering.enrolledCount}
        showSync={offering.kind === "GROUP"}
      />

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-medium">{offeringMessages.schedule.title}</h2>
        <ModuleScheduleEditor offeringId={offering.id} rows={schedule} timeZone={timeZone} />
      </section>
    </div>
  )
}
