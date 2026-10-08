import type { Database } from "@/types/database.types"

export type CourseStatus = Database["public"]["Enums"]["course_status"]
export type CourseAccessType = Database["public"]["Enums"]["course_access"]

export interface CourseListItem {
  id: string
  title: string
  status: CourseStatus
  accessType: CourseAccessType
}

export interface CourseDetail {
  id: string
  organizationId: string
  title: string
  description: string | null
  status: CourseStatus
  accessType: CourseAccessType
  publishedAt: string | null
  archivedAt: string | null
}

export interface CourseCompleteness {
  hasModule: boolean
  hasLesson: boolean
  hasBlock: boolean
}

export interface ProfessorCourseListItem {
  id: string
  title: string
  status: CourseStatus
  accessType: CourseAccessType
  /** Names of the editions this professor teaches. */
  editions: string[]
}
