import { notFound } from "next/navigation"
import { z } from "zod"
import { requireOrgRole } from "@/lib/auth/require-role"
import { PageHeader } from "@/components/shared/page-header"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { getStudentHeader } from "@/features/transcript/queries/get-student-header"
import { listStudentEnrollments } from "@/features/transcript/queries/list-student-enrollments"
import { StudentTranscript } from "@/features/transcript/components/student-transcript"
import { studentTranscriptMessages as t } from "@/lib/messages/student-transcript"

interface TeachStudentPageProps {
  params: Promise<{ userId: string }>
}

/** Escolaridad of a student, limited to editions the professor teaches. Name only (D27). */
export default async function TeachStudentPage({ params }: TeachStudentPageProps) {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const { userId } = await params
  if (!z.guid().safeParse(userId).success) {
    notFound()
  }

  const [header, shared, settings] = await Promise.all([
    getStudentHeader(userId, { role: "PROFESSOR", organizationId: ctx.organizationId }),
    listStudentEnrollments(userId),
    getOrgSettings(ctx.organizationId),
  ])
  // No shared edition (RPC returns only the professor's) = not found, no existence oracle.
  if (!header || shared.length === 0) {
    notFound()
  }

  const fullName = `${header.firstName} ${header.lastName}`.trim()

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title={fullName}
        eyebrow={t.title}
        breadcrumb={[{ label: t.students.title, href: "/teach/students" }, { label: fullName }]}
      />
      <StudentTranscript userId={userId} area="teach" timeZone={settings?.timezone ?? DEFAULT_TIME_ZONE} />
    </div>
  )
}
