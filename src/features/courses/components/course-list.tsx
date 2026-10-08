import Link from "next/link"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Pagination } from "@/components/shared/pagination"
import { SearchInput } from "@/components/shared/search-input"
import { Button } from "@/components/ui/button"
import { courseMessages } from "@/lib/messages/admin-courses"
import { buildListHref, firstParam, type SearchParams } from "@/lib/search-params"
import { listCourses, COURSES_PAGE_SIZE } from "../queries/list-courses"
import type { CourseListItem, CourseStatus } from "../types"
import { CourseStatusBadge } from "./course-status-badge"
import { CourseStatusFilter } from "./course-status-filter"

interface CourseListProps {
  organizationId: string
  basePath: string
  searchParams: SearchParams
}

const VALID_STATUSES: CourseStatus[] = ["DRAFT", "PUBLISHED", "ARCHIVED"]

/** Self-contained async Server Component: own query, search, status filter, pagination (mirrors GroupList). */
export async function CourseList({ organizationId, basePath, searchParams }: CourseListProps) {
  const page = Math.max(1, Number(firstParam(searchParams.page)) || 1)
  const q = firstParam(searchParams.q)?.trim() || undefined
  const rawStatus = firstParam(searchParams.status)
  const status = VALID_STATUSES.includes(rawStatus as CourseStatus) ? (rawStatus as CourseStatus) : undefined

  const { items, total } = await listCourses({ organizationId, page, q, status })

  const titleColumn: DataListColumn<CourseListItem> = {
    key: "title",
    header: courseMessages.list.titleHeader,
    cell: (course) => (
      <Link href={`${basePath}/${course.id}`} className="hover:underline">
        {course.title}
      </Link>
    ),
  }

  const columns: DataListColumn<CourseListItem>[] = [
    {
      key: "status",
      header: courseMessages.list.statusHeader,
      cell: (course) => <CourseStatusBadge status={course.status} />,
    },
    {
      key: "access",
      header: courseMessages.list.accessHeader,
      cell: (course) => courseMessages.access[course.accessType],
    },
    {
      key: "actions",
      header: courseMessages.list.viewAction,
      isActions: true,
      cell: (course) => (
        <Button variant="outline" size="sm" render={<Link href={`${basePath}/${course.id}`} />}>
          {courseMessages.list.viewAction}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <SearchInput placeholder={courseMessages.list.searchPlaceholder} />
          <CourseStatusFilter />
        </div>
        <Button render={<Link href={`${basePath}/new`} />}>{courseMessages.list.createAction}</Button>
      </div>
      <DataList
        items={items}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(course) => course.id}
        emptyTitle={courseMessages.list.emptyTitle}
      />
      <Pagination
        page={page}
        pageSize={COURSES_PAGE_SIZE}
        total={total}
        buildHref={(nextPage) =>
          buildListHref(basePath, searchParams, {
            page: nextPage > 1 ? String(nextPage) : undefined,
          })
        }
      />
    </div>
  )
}
