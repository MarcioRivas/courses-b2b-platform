import { notFound } from "next/navigation"
import { resolveEditableOffering } from "@/lib/courses/resolve-editable-offering"
import { getAssessmentEditorData } from "@/features/assessments/queries/get-assessment-editor-data"
import { EditionExamPage } from "@/features/assessments/components/edition-exam-page"

interface AdminExamPageProps {
  params: Promise<{ courseId: string; offeringId: string; assessmentId: string }>
  searchParams: Promise<{ step?: string }>
}

export default async function AdminExamPage({ params, searchParams }: AdminExamPageProps) {
  const [{ courseId, offeringId, assessmentId }, { step }] = await Promise.all([params, searchParams])
  const tree = await resolveEditableOffering(courseId, offeringId, ["ADMIN"])

  const exam = await getAssessmentEditorData(assessmentId)
  if (!exam || exam.offeringId !== offeringId || exam.kind !== "EXAM") {
    return notFound()
  }
  return <EditionExamPage tree={tree} area="admin" exam={exam} step={step} />
}
