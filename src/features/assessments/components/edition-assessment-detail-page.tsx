import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { DEFAULT_TIME_ZONE } from "@/lib/dates/end-of-day-in-time-zone"
import { editionCrumbs, editionPaths, type EditionArea } from "@/lib/courses/edition-paths"
import { getOrgSettings } from "@/features/organizations/queries/get-org-settings"
import type { OfferingTree } from "@/features/courses/queries/get-offering-tree"
import { getAssessmentConfigOptions } from "../queries/get-assessment-config"
import { isAssessmentReferenced } from "../queries/is-assessment-referenced"
import { deleteAssessment } from "../actions/delete-assessment"
import type { AssessmentDetail } from "../types"
import { AssessmentForm } from "./assessment-form"
import { AssessmentStatusBadge } from "./assessment-status-badge"
import { QuestionPicker } from "./question-picker"
import { ExtendWindowDialog } from "./extend-window-dialog"
import { PublishButton } from "./publish-button"

interface EditionAssessmentDetailPageProps {
  tree: OfferingTree
  area: EditionArea
  assessment: AssessmentDetail
}

/** Evaluation detail/config of one edition, shared by the admin tab and the teach route. */
export async function EditionAssessmentDetailPage({ tree, area, assessment }: EditionAssessmentDetailPageProps) {
  const labels = teachAssessmentMessages.assessments
  const [{ banks, questions }, settings, isReferenced] = await Promise.all([
    getAssessmentConfigOptions(tree.courseId),
    getOrgSettings(tree.organizationId),
    isAssessmentReferenced(assessment.id),
  ])
  const timeZone = settings?.timezone ?? DEFAULT_TIME_ZONE

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={assessment.title}
        description={`${labels.kinds[assessment.kind]} · ${labels.editionDescription(tree.title, tree.offeringName)}`}
        breadcrumb={[
          ...editionCrumbs(area, { ...tree, courseTitle: tree.title }),
          { label: labels.title, href: editionPaths(area, tree).assessments },
          { label: assessment.title },
        ]}
      >
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

      {/* A TASK has an instruction and a file submission, never questions. */}
      {assessment.kind !== "TASK" && (
        <QuestionPicker
          assessmentId={assessment.id}
          availableQuestions={questions}
          banks={banks}
          initialFixed={assessment.fixedQuestions}
          initialRandomBankId={assessment.questionBankId}
          initialRandomCount={assessment.randomQuestionCount}
        />
      )}
    </div>
  )
}
