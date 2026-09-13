import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { AssessmentStatusBadge } from "./assessment-status-badge"
import type { AssessmentListItem } from "../types"

export function AssessmentList({ courseId, assessments }: { courseId: string; assessments: AssessmentListItem[] }) {
  const labels = teachAssessmentMessages.assessments

  const titleColumn: DataListColumn<AssessmentListItem> = {
    key: "title",
    header: labels.titleLabel,
    cell: (assessment) => assessment.title,
  }

  const columns: DataListColumn<AssessmentListItem>[] = [
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
        <Button variant="outline" size="sm" render={<Link href={`/teach/courses/${courseId}/assessments/${assessment.id}`} />}>
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
