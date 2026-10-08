import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { EditionAssessmentsListPage } from "@/features/assessments/components/edition-assessments-list-page"

interface TeachEditionAssessmentsPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function TeachEditionAssessmentsPage({ params }: TeachEditionAssessmentsPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])
  return <EditionAssessmentsListPage tree={tree} area="teach" />
}
