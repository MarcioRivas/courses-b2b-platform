import { notFound } from "next/navigation"
import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { getAssessment } from "@/features/assessments/queries/get-assessment"
import { EditionAssessmentDetailPage } from "@/features/assessments/components/edition-assessment-detail-page"

interface TeachAssessmentDetailPageProps {
  params: Promise<{ courseId: string; offeringId: string; assessmentId: string }>
}

export default async function TeachAssessmentDetailPage({ params }: TeachAssessmentDetailPageProps) {
  const { courseId, offeringId, assessmentId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])

  const assessment = await getAssessment(assessmentId)
  if (!assessment || assessment.offeringId !== offeringId) {
    return notFound()
  }
  return <EditionAssessmentDetailPage tree={tree} area="teach" assessment={assessment} />
}
