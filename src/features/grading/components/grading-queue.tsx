import Link from "next/link"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Pagination } from "@/components/shared/pagination"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { buildListHref, type SearchParams } from "@/lib/search-params"
import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { teachGradingMessages } from "@/lib/messages/teach-grading"
import { PENDING_ATTEMPTS_PAGE_SIZE } from "../queries/list-pending-attempts"
import type { GradingStatusGroup, PendingAttemptListItem } from "../types"

const BASE_PATH = "/teach/grading"

interface GradingQueueProps {
  items: PendingAttemptListItem[]
  total: number
  page: number
  statusGroup: GradingStatusGroup
  timeZone: string
  searchParams: SearchParams
}

/** Attempt queue, oldest submission first (D15) — no bulk cross-attempt grading. */
export function GradingQueue({ items, total, page, statusGroup, timeZone, searchParams }: GradingQueueProps) {
  const titleColumn: DataListColumn<PendingAttemptListItem> = {
    key: "student",
    header: teachGradingMessages.queue.studentHeader,
    cell: (item) => item.studentName,
  }

  const columns: DataListColumn<PendingAttemptListItem>[] = [
    { key: "course", header: teachGradingMessages.queue.courseHeader, cell: (item) => item.courseTitle },
    { key: "assessment", header: teachGradingMessages.queue.assessmentHeader, cell: (item) => item.assessmentTitle },
    {
      key: "submittedAt",
      header: teachGradingMessages.queue.submittedAtHeader,
      cell: (item) => (item.submittedAt ? formatDateTimeInTimeZone(item.submittedAt, timeZone) : "—"),
    },
    {
      key: "status",
      header: teachGradingMessages.queue.statusHeader,
      cell: (item) => (
        <Badge variant={item.status === "GRADED" ? "success" : "warning"}>
          {teachGradingMessages.status[item.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: teachGradingMessages.queue.actionsHeader,
      isActions: true,
      cell: (item) => (
        <Button variant="outline" size="sm" render={<Link href={`${BASE_PATH}/${item.attemptId}`} />}>
          {teachGradingMessages.queue.gradeAction}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-1">
        <Button
          variant={statusGroup === "PENDING" ? "default" : "outline"}
          size="sm"
          render={<Link href={buildListHref(BASE_PATH, searchParams, { status: undefined, page: undefined })} />}
        >
          {teachGradingMessages.queue.tabPending}
        </Button>
        <Button
          variant={statusGroup === "GRADED" ? "default" : "outline"}
          size="sm"
          render={<Link href={buildListHref(BASE_PATH, searchParams, { status: "GRADED", page: undefined })} />}
        >
          {teachGradingMessages.queue.tabGraded}
        </Button>
      </div>
      <DataList
        items={items}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(item) => item.attemptId}
        emptyTitle={
          statusGroup === "PENDING" ? teachGradingMessages.queue.emptyPending : teachGradingMessages.queue.emptyGraded
        }
      />
      <Pagination
        page={page}
        pageSize={PENDING_ATTEMPTS_PAGE_SIZE}
        total={total}
        buildHref={(nextPage) =>
          buildListHref(BASE_PATH, searchParams, { page: nextPage > 1 ? String(nextPage) : undefined })
        }
      />
    </div>
  )
}
