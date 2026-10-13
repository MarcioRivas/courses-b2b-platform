import Link from "next/link"
import { PlusIcon } from "lucide-react"
import { PageHeader } from "@/components/shared/page-header"
import { Button } from "@/components/ui/button"
import { editionCrumbs, editionPaths, type EditionArea } from "@/lib/courses/edition-paths"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { OfferingTree } from "@/features/courses/queries/get-offering-tree"
import { OfferingTabs } from "@/features/offerings/components/offering-tabs"
import { listExams } from "../queries/list-exams"
import { getAssessmentWizardContext } from "../queries/get-assessment-editor-data"
import { ExamList } from "./exam-list"

/** The edition's exams (`…/exams`), shared by the admin tab and the teach route. */
export async function EditionExamsListPage({ tree, area }: { tree: OfferingTree; area: EditionArea }) {
  const labels = teachAssessmentMessages.exams
  const paths = editionPaths(area, tree)
  const [exams, { timeZone }] = await Promise.all([listExams(tree.offeringId), getAssessmentWizardContext(tree.organizationId)])

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title={labels.title}
        description={teachAssessmentMessages.assessments.editionDescription(tree.title, tree.offeringName)}
        breadcrumb={[...editionCrumbs(area, { ...tree, courseTitle: tree.title }), { label: labels.title }]}
      >
        <Button size="sm" render={<Link href={`${paths.exams}/new`} />}>
          <PlusIcon className="size-4" /> {labels.addAction}
        </Button>
      </PageHeader>
      <OfferingTabs courseId={tree.courseId} offeringId={tree.offeringId} active="examenes" area={area} />
      <ExamList examsPath={paths.exams} timeZone={timeZone} exams={exams} />
    </div>
  )
}
