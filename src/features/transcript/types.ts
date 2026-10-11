import type { Database } from "@/types/database.types"

export type EnrollmentStatus = Database["public"]["Enums"]["enrollment_status"]
export type AttemptStatus = Database["public"]["Enums"]["attempt_status"]
export type AssessmentKind = Database["public"]["Enums"]["assessment_kind"]

export type CourseOutcome = "APPROVED" | "FAILED" | "IN_PROGRESS" | "CANCELLED"

export const COURSE_OUTCOME_LABEL: Record<CourseOutcome, string> = {
  APPROVED: "Aprobado",
  FAILED: "Reprobado",
  IN_PROGRESS: "En progreso",
  CANCELLED: "Cancelado",
}

export interface StudentEnrollment {
  enrollmentId: string
  offeringId: string
  courseId: string
  courseTitle: string
  offeringLabel: string
  startsAt: string | null
  endsAt: string | null
  status: EnrollmentStatus
  enrolledAt: string
  startedAt: string | null
  completedAt: string | null
  progressPercent: number
  completedBlocks: number
  totalBlocks: number
}

/** Latest-attempt summary of one PUBLISHED assessment of the edition. */
export interface TranscriptAssessment {
  assessmentId: string
  title: string
  kind: AssessmentKind
  /** Null = unlimited attempts. */
  maxAttempts: number | null
  availableUntil: string | null
  attemptsUsed: number
  lastAttemptId: string | null
  lastStatus: AttemptStatus | null
  scorePercent: number | null
  scoreLabel: string | null
  passed: boolean | null
}

export type ActivityKind = "MODULE_COMPLETED" | "BLOCK_COMPLETED" | "ATTEMPT_SUBMITTED" | "ATTEMPT_GRADED"

export interface TranscriptActivity {
  kind: ActivityKind
  occurredAt: string
  moduleTitle: string | null
  lessonTitle: string | null
  itemTitle: string | null
  scoreLabel: string | null
  passed: boolean | null
}

export interface TranscriptPendingItem {
  /** BLOCK = required content block not completed; ASSESSMENT = no passing graded attempt yet. */
  kind: "BLOCK" | "ASSESSMENT"
  moduleTitle: string | null
  lessonTitle: string | null
  itemTitle: string | null
  /** Block type (YOUTUBE_VIDEO, QUIZ, ...) or assessment kind. */
  itemKind: string
}

export interface EnrollmentTranscriptDetail {
  assessments: TranscriptAssessment[]
  activity: TranscriptActivity[]
  pending: TranscriptPendingItem[]
}

export interface StudentHeader {
  userId: string
  firstName: string
  lastName: string
  /** Admin-only (D27): always null for professors. */
  email: string | null
  phone: string | null
}

export interface ProfessorStudent {
  userId: string
  firstName: string
  lastName: string
  editions: string[]
}
