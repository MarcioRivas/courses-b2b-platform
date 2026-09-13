import Link from "next/link"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Pagination } from "@/components/shared/pagination"
import { SearchInput } from "@/components/shared/search-input"
import { ConfirmDialog } from "@/components/shared/confirm-dialog"
import { Button } from "@/components/ui/button"
import { messages } from "@/lib/messages/es"
import { courseMessages } from "@/lib/messages/admin-courses"
import { buildListHref, firstParam, type SearchParams } from "@/lib/search-params"
import { listCourses, COURSES_PAGE_SIZE } from "../queries/list-courses"
import { deleteCourse } from "../actions/delete-course"
import type { CourseListItem, CourseStatus } from "../types"
import { CourseStatusBadge } from "./course-status-badge"

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
        <div className="flex gap-1">
          <Button variant="outline" size="sm" render={<Link href={`${basePath}/${course.id}`} />}>
            {courseMessages.list.viewAction}
          </Button>
          {course.status === "DRAFT" && (
            <ConfirmDialog
              trigger={
                <Button variant="ghost" size="sm">
                  {messages.common.delete}
                </Button>
              }
              title={courseMessages.delete.title}
              description={courseMessages.delete.description}
              confirmLabel={messages.common.delete}
              destructive
              successMessage={courseMessages.delete.success}
              action={deleteCourse}
              input={{ courseId: course.id }}
            />
          )}
        </div>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput placeholder={courseMessages.list.searchPlaceholder} />
          <div className="flex flex-wrap gap-1">
            <Button
              variant={status === undefined ? "default" : "outline"}
              size="sm"
              render={<Link href={buildListHref(basePath, searchParams, { status: undefined, page: undefined })} />}
            >
              {courseMessages.list.statusFilterAll}
            </Button>
            {VALID_STATUSES.map((s) => (
              <Button
                key={s}
                variant={status === s ? "default" : "outline"}
                size="sm"
                render={<Link href={buildListHref(basePath, searchParams, { status: s, page: undefined })} />}
              >
                {courseMessages.status[s]}
              </Button>
            ))}
          </div>
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
