import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { EditionExamsListPage } from "@/features/assessments/components/edition-exams-list-page"

interface AdminEditionExamsPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function AdminEditionExamsPage({ params }: AdminEditionExamsPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["ADMIN"])
  return <EditionExamsListPage tree={tree} area="admin" />
}
