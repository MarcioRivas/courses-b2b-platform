import type { Database } from "@/types/database.types"

export type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"]
export type EnrollmentSource = Database["public"]["Enums"]["enrollment_source"]

export interface StudentEnrollment {
  id: string
  status: EnrollmentStatus
  source: EnrollmentSource
  progressPercent: number
  completedBlocks: number
  totalBlocks: number
  completedAt: string | null
  courseId: string
  courseTitle: string
  courseDescription: string | null
  offeringName: string
  /** UTC instant; formatted in the organization's timezone by the UI (C16). */
  endsAt: string | null
  /** The course is ARCHIVED or the offering CANCELLED: visible, but read-only. */
  closed: boolean
}

/** Dashboard buckets: assigned vs free, each split into active and finished (§37). */
export interface EnrollmentBuckets {
  assigned: { active: StudentEnrollment[]; finished: StudentEnrollment[] }
  free: { active: StudentEnrollment[]; finished: StudentEnrollment[] }
}

export interface FreeCourse {
  id: string
  title: string
  description: string | null
}
