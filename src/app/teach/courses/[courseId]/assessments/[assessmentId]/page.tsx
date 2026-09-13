import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeftIcon } from "lucide-react"
import { requireOrgRole } from "@/lib/auth/require-role"
import { canEditCourse } from "@/lib/auth/course-access"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import { getAssessment } from "@/features/assessments/queries/get-assessment"
import { getAssessmentConfigOptions } from "@/features/assessments/queries/get-assessment-config"
import { isAssessmentReferenced } from "@/features/assessments/queries/is-assessment-referenced"
import { AssessmentForm } from "@/features/assessments/components/assessment-form"
import { AssessmentStatusBadge } from "@/features/assessments/components/assessment-status-badge"
import { QuestionPicker } from "@/features/assessments/components/question-picker"
import { ExtendWindowDialog } from "@/features/assessments/components/extend-window-dialog"
import { PublishButton } from "@/features/assessments/components/publish-button"
import { deleteAssessment } from "@/features/assessments/actions/delete-assessment"

interface AssessmentDetailPageProps {
  params: Promise<{ courseId: string; assessmentId: string }>
}

export default async function AssessmentDetailPage({ params }: AssessmentDetailPageProps) {
  const ctx = await requireOrgRole(["PROFESSOR"])
  const { courseId, assessmentId } = await params

  if (!(await canEditCourse(courseId))) {
    return notFound()
  }

  const assessment = await getAssessment(assessmentId)
  if (!assessment || assessment.courseId !== courseId) {
    return notFound()
  }

  const [{ banks, questions }, settings, isReferenced] = await Promise.all([
    getAssessmentConfigOptions(courseId),
    getOrgSettings(ctx.organizationId),
    isAssessmentReferenced(assessment.id),
  ])
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE
  const labels = teachAssessmentMessages.assessments

  return (
    <div className="flex flex-col gap-4">
      <Link
        href={`/teach/courses/${courseId}/assessments`}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon className="size-4" /> {labels.backToAssessments}
      </Link>

      <PageHeader title={assessment.title} description={labels.kinds[assessment.kind]}>
        <div className="flex flex-wrap items-center gap-2">
          <AssessmentStatusBadge status={assessment.status} />
          {assessment.status === "DRAFT" && <PublishButton assessmentId={assessment.id} />}
          {assessment.kind === "EXAM" && assessment.status === "PUBLISHED" && (
            <ExtendWindowDialog assessmentId={assessment.id} currentUntil={assessment.availableUntil} timeZone={timeZone} />
          )}
          <ConfirmDialog
            trigger={<Button variant="outline">{messages.common.delete}</Button>}
            title={labels.deleteTitle}
            description={labels.deleteDescription}
            confirmLabel={messages.common.delete}
            destructive
            successMessage={labels.deleted}
            action={deleteAssessment}
            input={{ assessmentId: assessment.id }}
          />
        </div>
      </PageHeader>

      <AssessmentForm
        assessment={assessment}
        timeZone={timeZone}
        isPublished={assessment.status === "PUBLISHED"}
        isReferenced={isReferenced}
      />

      <QuestionPicker
        assessmentId={assessment.id}
        availableQuestions={questions}
        banks={banks}
        initialFixed={assessment.fixedQuestions}
        initialRandomBankId={assessment.questionBankId}
        initialRandomCount={assessment.randomQuestionCount}
      />
    </div>
  )
}
