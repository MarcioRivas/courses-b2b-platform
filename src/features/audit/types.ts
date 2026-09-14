import type { Json } from "@/types/database.types"

export interface AuditLogListItem {
  id: number
  organizationId: string | null
  organizationName: string | null
  actorUserId: string | null
  actorName: string | null
  action: string
  entityType: string
  entityId: string | null
  metadata: Json
  createdAt: string
}

export interface AuditLogListResult {
  items: AuditLogListItem[]
  total: number
  page: number
  pageSize: number
}

export interface AuditActionOption {
  action: string
  label: string
  entityType: string
}
