import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { EditionAssessmentNewPage } from "@/features/assessments/components/edition-assessment-new-page"

interface TeachNewAssessmentPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function TeachNewAssessmentPage({ params }: TeachNewAssessmentPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])
  return <EditionAssessmentNewPage tree={tree} area="teach" />
}
