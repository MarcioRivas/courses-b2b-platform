import { PageHeader } from "@/components/shared/page-header"
import { editionCrumbs, editionPaths, type EditionArea } from "@/lib/courses/edition-paths"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { OfferingTree } from "@/features/courses/queries/get-offering-tree"
import { NewAssessmentForm } from "./new-assessment-form"

/** Bare create screen for an evaluation of one edition. */
export function EditionAssessmentNewPage({ tree, area }: { tree: OfferingTree; area: EditionArea }) {
  const labels = teachAssessmentMessages.assessments
  const assessmentsPath = editionPaths(area, tree).assessments

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={labels.createTitle}
        description={labels.editionDescription(tree.title, tree.offeringName)}
        breadcrumb={[
          ...editionCrumbs(area, { ...tree, courseTitle: tree.title }),
          { label: labels.title, href: assessmentsPath },
          { label: labels.createTitle },
        ]}
      />
      <NewAssessmentForm offeringId={tree.offeringId} assessmentsPath={assessmentsPath} />
    </div>
  )
}
