import type { Database } from "@/types/database.types"

export type OrgStatus = Database["public"]["Enums"]["org_status"]

export interface OrganizationSummary {
  id: string
  name: string
  status: OrgStatus
}

export interface OrganizationListItem {
  id: string
  name: string
  slug: string
  status: OrgStatus
  memberCount: number
}

export interface OrgSettings {
  timezone: string
  defaultPassingScore: number
}

export interface ScoreRange {
  id: string
  organizationId: string
  label: string
  minScore: number
  maxScore: number
  isPassing: boolean
}

export interface OrgStats {
  activeStudents: number
  professors: number
  groups: number
  activeLinks: number
}
