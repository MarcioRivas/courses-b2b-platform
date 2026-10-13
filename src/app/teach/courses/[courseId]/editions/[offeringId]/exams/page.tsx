import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { EditionExamsListPage } from "@/features/assessments/components/edition-exams-list-page"

interface TeachEditionExamsPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function TeachEditionExamsPage({ params }: TeachEditionExamsPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])
  return <EditionExamsListPage tree={tree} area="teach" />
}
