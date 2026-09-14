import { formatDateTimeInTimeZone } from "@/lib/dates/format-in-time-zone"
import { auditMessages } from "@/lib/messages/audit"
import { entityTypeLabel } from "../action-catalog"
import { ActionLabel } from "./action-label"
import type { AuditLogListItem } from "../types"

interface AuditEntryRowProps {
  entry: AuditLogListItem
  timeZone: string
  showOrganization?: boolean
}

function hasMetadata(metadata: AuditLogListItem["metadata"]): boolean {
  return typeof metadata === "object" && metadata !== null && Object.keys(metadata).length > 0
}

/**
 * One audit event as a native `<details>` card: no client JS needed to expand
 * the `metadata` JSON, so the whole `/admin/audit` and `/platform/audit`
 * pages stay Server Components.
 */
export function AuditEntryRow({ entry, timeZone, showOrganization }: AuditEntryRowProps) {
  return (
    <li className="rounded-lg border bg-card p-4">
      <details>
        <summary className="flex cursor-pointer flex-wrap items-center gap-x-3 gap-y-1 text-sm">
          <span className="text-muted-foreground">{formatDateTimeInTimeZone(entry.createdAt, timeZone)}</span>
          <span className="font-medium">{entry.actorName ?? auditMessages.systemActor}</span>
          <ActionLabel action={entry.action} />
          <span className="text-muted-foreground">{entityTypeLabel(entry.entityType)}</span>
          {showOrganization && (
            <span className="text-muted-foreground">
              {entry.organizationName ?? auditMessages.unknownOrganization}
            </span>
          )}
          <span className="ml-auto text-xs text-muted-foreground">{auditMessages.metadata.toggle}</span>
        </summary>
        <div className="mt-3 border-t pt-3 text-xs">
          {entry.entityId && (
            <p className="mb-2 text-muted-foreground">
              {auditMessages.entityIdLabel} <span className="font-mono">{entry.entityId}</span>
            </p>
          )}
          {hasMetadata(entry.metadata) ? (
            <pre className="overflow-x-auto rounded bg-muted p-2 font-mono">
              {JSON.stringify(entry.metadata, null, 2)}
            </pre>
          ) : (
            <p className="text-muted-foreground">{auditMessages.metadata.empty}</p>
          )}
        </div>
      </details>
    </li>
  )
}
