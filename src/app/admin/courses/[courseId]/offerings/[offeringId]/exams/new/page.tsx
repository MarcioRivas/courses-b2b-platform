import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { EditionExamPage } from "@/features/assessments/components/edition-exam-page"

interface AdminNewExamPageProps {
  params: Promise<{ courseId: string; offeringId: string }>
}

export default async function AdminNewExamPage({ params }: AdminNewExamPageProps) {
  const { courseId, offeringId } = await params
  const tree = await resolveEditableOffering(courseId, offeringId, ["ADMIN"])
  return <EditionExamPage tree={tree} area="admin" exam={null} />
}
