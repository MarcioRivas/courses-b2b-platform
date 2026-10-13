import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { messages } from "@/lib/messages/es"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { editionCrumbs, editionPaths, type EditionArea } from "@/lib/courses/edition-paths"
import type { OfferingTree } from "@/features/courses/queries/get-offering-tree"
import { getAssessmentWizardContext } from "../queries/get-assessment-editor-data"
import { deleteAssessment } from "../actions/delete-assessment"
import type { AssessmentEditorData } from "../types"
import type { WizardStepId } from "./wizard/assessment-wizard"
import { ExamWizard } from "./exam-wizard"

interface EditionExamPageProps {
  tree: OfferingTree
  area: EditionArea
  /** NULL = new exam. */
  exam: AssessmentEditorData | null
  step?: string
}

const STEPS: WizardStepId[] = ["config", "content", "review"]

/** Create or edit one exam of an edition through the stepped wizard. */
export async function EditionExamPage({ tree, area, exam, step }: EditionExamPageProps) {
  const labels = teachAssessmentMessages.exams
  const examsPath = editionPaths(area, tree).exams
  const context = await getAssessmentWizardContext(tree.organizationId)
  const title = exam?.title ?? labels.createTitle

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={title}
        description={teachAssessmentMessages.assessments.editionDescription(tree.title, tree.offeringName)}
        breadcrumb={[
          ...editionCrumbs(area, { ...tree, courseTitle: tree.title }),
          { label: labels.title, href: examsPath },
          { label: title },
        ]}
      >
        {exam && (
          <ConfirmDialog
            trigger={<Button variant="outline">{messages.common.delete}</Button>}
            title={labels.deleteTitle}
            description={labels.deleteDescription}
            confirmLabel={messages.common.delete}
            destructive
            successMessage={labels.deleted}
            action={deleteAssessment}
            input={{ assessmentId: exam.id }}
            redirectTo={examsPath}
          />
        )}
      </PageHeader>

      <ExamWizard
        offeringId={tree.offeringId}
        examsPath={examsPath}
        context={context}
        initial={exam}
        initialStep={STEPS.find((s) => s === step)}
      />
    </div>
  )
}
