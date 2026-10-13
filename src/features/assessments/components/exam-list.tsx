import Link from "next/link"
import { Button } from "@/components/ui/button"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import { AssessmentStatusBadge } from "./assessment-status-badge"
import type { ExamListItem } from "../types"

interface ExamListProps {
  /** The edition's `…/exams` route. */
  examsPath: string
  timeZone: string
  exams: ExamListItem[]
}

export function ExamList({ examsPath, timeZone, exams }: ExamListProps) {
  const labels = teachAssessmentMessages.exams
  const date = (iso: string) => formatDateTimeInTimeZone(iso, timeZone)

  const titleColumn: DataListColumn<ExamListItem> = {
    key: "title",
    header: teachAssessmentMessages.assessments.titleLabel,
    cell: (exam) => exam.title,
  }

  const columns: DataListColumn<ExamListItem>[] = [
    {
      key: "window",
      header: labels.windowColumn,
      cell: (exam) =>
        exam.availableFrom && exam.availableUntil ? `${date(exam.availableFrom)} → ${date(exam.availableUntil)}` : labels.noWindow,
    },
    {
      key: "questions",
      header: labels.questionsColumn,
      cell: (exam) =>
        exam.randomQuestionCount
          ? teachAssessmentMessages.review.summary.randomOf(exam.randomQuestionCount, exam.questionCount)
          : exam.questionCount,
    },
    {
      key: "status",
      header: teachAssessmentMessages.assessments.statusLabel,
      cell: (exam) => <AssessmentStatusBadge status={exam.status} />,
    },
    {
      key: "actions",
      header: "",
      isActions: true,
      cell: (exam) => (
        <Button variant="outline" size="sm" render={<Link href={`${examsPath}/${exam.id}`} />}>
          {labels.editAction}
        </Button>
      ),
    },
  ]

  return (
    <DataList items={exams} titleColumn={titleColumn} columns={columns} getRowKey={(exam) => exam.id} emptyTitle={labels.emptyTitle} />
  )
}
