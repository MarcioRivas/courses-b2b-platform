import { EmptyState } from "@/components/shared/empty-state"
import { auditMessages } from "@/lib/messages/audit"
import { AuditEntryRow } from "./audit-entry-row"
import type { AuditLogListItem } from "../types"

interface AuditTableProps {
  items: AuditLogListItem[]
  timeZone: string
  /** Platform variant only: shows each row's organization. */
  showOrganization?: boolean
}

export function AuditTable({ items, timeZone, showOrganization }: AuditTableProps) {
  if (items.length === 0) {
    return <EmptyState title={auditMessages.empty.title} description={auditMessages.empty.description} />
  }

  return (
    <ul className="flex flex-col gap-2">
      {items.map((entry) => (
        <AuditEntryRow key={entry.id} entry={entry} timeZone={timeZone} showOrganization={showOrganization} />
      ))}
    </ul>
  )
}
