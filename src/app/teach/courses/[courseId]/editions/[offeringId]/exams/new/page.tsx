import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { EditionExamPage } from "@/features/assessments/components/edition-exam-page"

interface TeachNewExamPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function TeachNewExamPage({ params }: TeachNewExamPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])
  return <EditionExamPage tree={tree} area="teach" exam={null} />
}
