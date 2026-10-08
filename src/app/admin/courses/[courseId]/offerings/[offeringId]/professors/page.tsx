import { notFound } from "next/navigation"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { courseMessages } from "@/lib/messages/admin-courses"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { getOffering } from "@/features/offerings/queries/get-offering"
import { getOfferingProfessors } from "@/features/offerings/queries/get-offering-professors"
import { OfferingTabs } from "@/features/offerings/components/offering-tabs"
import { OfferingProfessorsPanel } from "@/features/offerings/components/offering-professors-panel"

interface OfferingProfessorsPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function OfferingProfessorsPage({ params }: OfferingProfessorsPageProps) {
  const ctx = await requireOrgRole(["ADMIN"])
  const { courseId, offeringId } = await params

  const offering = await getOffering(offeringId)
  if (!offering || offering.organizationId !== ctx.organizationId || offering.courseId !== courseId) {
    return notFound()
  }

  const professors = await getOfferingProfessors(offeringId)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={offering.name}
        description={offering.courseTitle}
        breadcrumb={[
          { label: courseMessages.list.title, href: "/admin/courses" },
          { label: offering.courseTitle, href: `/admin/courses/${courseId}` },
          { label: offeringMessages.list.title, href: `/admin/courses/${courseId}/offerings` },
          { label: offering.name },
        ]}
      />
      <OfferingTabs courseId={courseId} offeringId={offeringId} active="profesores" />
      <OfferingProfessorsPanel offeringId={offeringId} professors={professors} />
    </div>
  )
}
