import { notFound } from "next/navigation"
import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { getAssessment } from "@/features/assessments/queries/get-assessment"
import { EditionAssessmentDetailPage } from "@/features/assessments/components/edition-assessment-detail-page"

interface AdminAssessmentDetailPageProps {
  params: Promise<{ courseId: string; offeringId: string; assessmentId: string }>
}

export default async function AdminAssessmentDetailPage({ params }: AdminAssessmentDetailPageProps) {
  const { courseId, offeringId, assessmentId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["ADMIN"])

  const assessment = await getAssessment(assessmentId)
  if (!assessment || assessment.offeringId !== offeringId) {
    return notFound()
  }
  return <EditionAssessmentDetailPage tree={tree} area="admin" assessment={assessment} />
}
