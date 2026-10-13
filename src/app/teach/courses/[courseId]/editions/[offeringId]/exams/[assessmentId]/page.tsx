import { notFound } from "next/navigation"
import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { getAssessmentEditorData } from "@/features/assessments/queries/get-assessment-editor-data"
import { EditionExamPage } from "@/features/assessments/components/edition-exam-page"

interface TeachExamPageProps {
  params: Promise<{ courseId: string; offeringId: string; assessmentId: string }>
  searchParams: Promise<{ step?: string }>
}

export default async function TeachExamPage({ params, searchParams }: TeachExamPageProps) {
  const [{ courseId, offeringId, assessmentId }, { step }] = await Promise.all([params, searchParams])
  const tree = await resolveEditableOffering(courseId, offeringId, ["PROFESSOR"])

  const exam = await getAssessmentEditorData(assessmentId)
  if (!exam || exam.offeringId !== offeringId || exam.kind !== "EXAM") {
    return notFound()
  }
  return <EditionExamPage tree={tree} area="teach" exam={exam} step={step} />
}
