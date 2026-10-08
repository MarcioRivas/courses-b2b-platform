import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { EditionAssessmentsListPage } from "@/features/assessments/components/edition-assessments-list-page"

interface AdminEditionAssessmentsPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function AdminEditionAssessmentsPage({ params }: AdminEditionAssessmentsPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["ADMIN"])
  return <EditionAssessmentsListPage tree={tree} area="admin" />
}
