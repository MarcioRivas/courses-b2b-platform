import type { Database } from "@/types/database.types"

export type CourseStatus = Database["public"]["Enums"]["course_status"]
export type AssessmentKind = Database["public"]["Enums"]["assessment_kind"]
export type OrgStatus = Database["public"]["Enums"]["org_status"]

/** `org_overview_stats` RPC — single-row org admin dashboard summary. */
export interface OrgOverviewStats {
  studentsTotal: number
  studentsActive: number
  studentsWithEnrollment: number
  studentsCompletedCourse: number
  professorsTotal: number
  professorsActive: number
  adminsActive: number
  coursesDraft: number
  coursesPublished: number
  coursesArchived: number
  attemptsInProgress: number
  attemptsSubmitted: number
  attemptsAutoSubmitted: number
  attemptsGraded: number
}

/** `org_course_stats` RPC — one row per course. */
export interface CourseStatsRow {
  courseId: string
  courseTitle: string
  status: CourseStatus
  offeringsCount: number
  enrolledCount: number
  avgProgressPercent: number
  completionRate: number
  lastActivity: string | null
}

/** `org_professor_stats` RPC — one row per PROFESSOR membership. */
export interface ProfessorStatsRow {
  professorUserId: string
  firstName: string
  lastName: string
  assignedCoursesCount: number
  attemptsGradedCount: number
  lastGradedAt: string | null
  pendingGradingCount: number
}

/** `org_assessment_stats` RPC — one row per assessment. */
export interface AssessmentStatsRow {
  assessmentId: string
  title: string
  courseId: string
  courseTitle: string
  kind: AssessmentKind
  attemptsCount: number
  submittedCount: number
  gradedCount: number
  avgScorePercent: number
  passedCount: number
  failedCount: number
}

/** `assessment_score_distribution` RPC — one bucket per org score range + "Sin rango". */
export interface ScoreDistributionBucket {
  label: string
  count: number
}

/** `platform_org_stats` RPC — one row per organization. */
export interface PlatformOrgStatsRow {
  organizationId: string
  name: string
  status: OrgStatus
  studentsCount: number
  professorsCount: number
  coursesCount: number
  enrollmentsCount: number
  attemptsCount: number
  avgProgressPercent: number
}

/** Platform totals, summed in the query layer from `PlatformOrgStatsRow[]` (spec step 7). */
export interface PlatformTotals {
  organizations: number
  students: number
  professors: number
  courses: number
  enrollments: number
  attempts: number
}

/** `professor_overview_stats` RPC — one row per course the professor is assigned to (B12). */
export interface ProfessorOverviewRow {
  courseId: string
  courseTitle: string
  enrolledCount: number
  avgProgressPercent: number
  attemptsInProgress: number
  attemptsSubmitted: number
  attemptsAutoSubmitted: number
  attemptsGraded: number
  pendingGradingCount: number
}
