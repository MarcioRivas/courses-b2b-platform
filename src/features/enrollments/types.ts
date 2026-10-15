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
  /** Last completed block, else started/enrolled date: orders in-progress courses. */
  lastActivityAt: string
  /** Lesson of the most recently completed block, for the "Continuar" deep link. */
  resumeLessonId: string | null
}

/** A FREE course of the student's organization they can enroll in now (open, active edition). */
export interface AvailableCourse {
  id: string
  title: string
  description: string | null
  moduleCount: number
}
