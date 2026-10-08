import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { AssessmentStatusBadge } from "./assessment-status-badge"
import type { AssessmentListItem } from "../types"

interface AssessmentListProps {
  /** The edition's `…/assessments` route. */
  assessmentsPath: string
  offeringName: string
  assessments: AssessmentListItem[]
}

export function AssessmentList({ assessmentsPath, offeringName, assessments }: AssessmentListProps) {
  const labels = teachAssessmentMessages.assessments

  const titleColumn: DataListColumn<AssessmentListItem> = {
    key: "title",
    header: labels.titleLabel,
    cell: (assessment) => assessment.title,
  }

  const columns: DataListColumn<AssessmentListItem>[] = [
    {
      key: "edition",
      header: labels.editionLabel,
      cell: () => offeringName,
    },
    {
      key: "kind",
      header: labels.kindLabel,
      cell: (assessment) => labels.kinds[assessment.kind],
    },
    {
      key: "status",
      header: labels.statusLabel,
      cell: (assessment) => <AssessmentStatusBadge status={assessment.status} />,
    },
    {
      key: "questions",
      header: labels.questionsSectionTitle,
      cell: (assessment) =>
        assessment.randomQuestionCount
          ? `${assessment.questionCount} + ${assessment.randomQuestionCount} al azar`
          : assessment.questionCount,
    },
    {
      key: "actions",
      header: "",
      isActions: true,
      cell: (assessment) => (
        <Button variant="outline" size="sm" render={<Link href={`${assessmentsPath}/${assessment.id}`} />}>
          {labels.editTitle}
        </Button>
      ),
    },
  ]

  return (
    <DataList
      items={assessments}
      titleColumn={titleColumn}
      columns={columns}
      getRowKey={(assessment) => assessment.id}
      emptyTitle={labels.emptyTitle}
    />
  )
}
