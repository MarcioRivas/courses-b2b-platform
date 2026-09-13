import type { Database } from "@/types/database.types"

export type OfferingKind = Database["public"]["Enums"]["offering_kind"]
export type OfferingStatus = Database["public"]["Enums"]["offering_status"]

export interface OfferingListItem {
  id: string
  name: string
  kind: OfferingKind
  status: OfferingStatus
  groupName: string | null
  startsAt: string | null
  endsAt: string | null
}

export interface OfferingDetail {
  id: string
  courseId: string
  courseTitle: string
  organizationId: string
  kind: OfferingKind
  groupId: string | null
  groupName: string | null
  name: string
  startsAt: string | null
  endsAt: string | null
  status: OfferingStatus
  enrolledCount: number
}

export interface OrgGroupOption {
  id: string
  name: string
}

export interface ModuleScheduleRow {
  moduleId: string
  moduleTitle: string
  modulePosition: number
  availableFrom: string | null
  availableUntil: string | null
}
