import Link from "next/link"
import { DataList, type DataListColumn } from "@/components/shared/data-list"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { offeringMessages } from "@/lib/messages/admin-offerings"
import { listOfferings } from "../queries/list-offerings"
import { listOrgGroups } from "../queries/list-org-groups"
import type { OfferingListItem } from "../types"
import { OfferingForm } from "./offering-form"

interface OfferingListProps {
  courseId: string
  courseAccessType: "FREE" | "PRIVATE"
  organizationId: string
  timeZone: string
  basePath: string
}

/** Self-contained async Server Component: own query for a single course's offerings (no pagination — MVP org sizes). */
export async function OfferingList({ courseId, courseAccessType, organizationId, timeZone, basePath }: OfferingListProps) {
  const [items, groups] = await Promise.all([listOfferings(courseId), listOrgGroups(organizationId)])

  const titleColumn: DataListColumn<OfferingListItem> = {
    key: "name",
    header: offeringMessages.list.nameHeader,
    cell: (offering) => (
      <Link href={`${basePath}/${offering.id}`} className="hover:underline">
        {offering.name}
      </Link>
    ),
  }

  const columns: DataListColumn<OfferingListItem>[] = [
    {
      key: "kind",
      header: offeringMessages.list.kindHeader,
      cell: (offering) => offeringMessages.kind[offering.kind],
    },
    {
      key: "group",
      header: offeringMessages.list.groupHeader,
      cell: (offering) => offering.groupName ?? "—",
    },
    {
      key: "status",
      header: offeringMessages.list.statusHeader,
      cell: (offering) => (
        <Badge variant={offering.status === "ACTIVE" ? "default" : "outline"}>
          {offeringMessages.status[offering.status]}
        </Badge>
      ),
    },
    {
      key: "actions",
      header: offeringMessages.list.viewAction,
      isActions: true,
      cell: (offering) => (
        <Button variant="outline" size="sm" render={<Link href={`${basePath}/${offering.id}`} />}>
          {offeringMessages.list.viewAction}
        </Button>
      ),
    },
  ]

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-end">
        <OfferingForm
          mode="create"
          courseId={courseId}
          courseAccessType={courseAccessType}
          groups={groups}
          timeZone={timeZone}
          trigger={<Button>{offeringMessages.list.createAction}</Button>}
        />
      </div>
      <DataList
        items={items}
        titleColumn={titleColumn}
        columns={columns}
        getRowKey={(offering) => offering.id}
        emptyTitle={offeringMessages.list.emptyTitle}
      />
    </div>
  )
}
