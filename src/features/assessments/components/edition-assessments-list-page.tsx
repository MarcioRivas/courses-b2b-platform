import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { editionCrumbs, editionPaths, type EditionArea } from "@/lib/courses/edition-paths"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { OfferingTree } from "@/features/courses/queries/get-offering-tree"
import { OfferingTabs } from "@/features/offerings/components/offering-tabs"
import { listAssessments } from "../queries/list-assessments"
import { AssessmentList } from "./assessment-list"

/** Evaluations of one edition (`…/assessments`), shared by the admin tab and the teach route. */
export async function EditionAssessmentsListPage({ tree, area }: { tree: OfferingTree; area: EditionArea }) {
  const labels = teachAssessmentMessages.assessments
  const paths = editionPaths(area, tree)
  const assessments = await listAssessments(tree.offeringId)

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={labels.title}
        description={labels.editionDescription(tree.title, tree.offeringName)}
        breadcrumb={[...editionCrumbs(area, { ...tree, courseTitle: tree.title }), { label: labels.title }]}
      >
        <Button size="sm" render={<Link href={`${paths.assessments}/new`} />}>
          <PlusIcon className="size-4" /> {labels.addAction}
        </Button>
      </PageHeader>
      <OfferingTabs courseId={tree.courseId} offeringId={tree.offeringId} active="evaluaciones" area={area} />
      <AssessmentList assessmentsPath={paths.assessments} offeringName={tree.offeringName} assessments={assessments} />
    </div>
  )
}
