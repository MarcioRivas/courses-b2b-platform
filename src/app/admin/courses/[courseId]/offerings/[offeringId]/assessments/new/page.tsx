import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { EditionAssessmentNewPage } from "@/features/assessments/components/edition-assessment-new-page"

interface AdminNewAssessmentPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function AdminNewAssessmentPage({ params }: AdminNewAssessmentPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["ADMIN"])
  return <EditionAssessmentNewPage tree={tree} area="admin" />
}
