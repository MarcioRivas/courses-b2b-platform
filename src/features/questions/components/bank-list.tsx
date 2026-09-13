import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { teachAssessmentMessages } from "@/lib/messages/teach-assessments"
import type { BankListItem } from "../types"

export function BankList({ banks }: { banks: BankListItem[] }) {
  const labels = teachAssessmentMessages.banks

  const titleColumn: DataListColumn<BankListItem> = {
    key: "name",
    header: labels.nameLabel,
    cell: (bank) => bank.name,
  }

  const columns: DataListColumn<BankListItem>[] = [
    {
      key: "scope",
      header: labels.courseLabel,
      cell: (bank) => (bank.courseTitle ? bank.courseTitle : <Badge variant="outline">{labels.courseOrgWideBadge}</Badge>),
    },
    {
      key: "count",
      header: labels.questionsCountLabel,
      cell: (bank) => bank.questionCount,
    },
    {
      key: "actions",
      header: "",
      isActions: true,
      cell: (bank) => (
        <Button variant="outline" size="sm" render={<Link href={`/teach/banks/${bank.id}`} />}>
          {teachAssessmentMessages.questions.title}
        </Button>
      ),
    },
  ]

  return (
    <DataList
      items={banks}
      titleColumn={titleColumn}
      columns={columns}
      getRowKey={(bank) => bank.id}
      emptyTitle={labels.emptyTitle}
    />
  )
}
