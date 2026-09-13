import type { Database } from "@/types/database.types"

export type AttemptStatus = Database["public"]["Enums"]["attempt_status"]
export type QuestionType = Database["public"]["Enums"]["question_type"]
export type AssessmentKind = Database["public"]["Enums"]["assessment_kind"]
export type GradingStatusGroup = "PENDING" | "GRADED"

export interface PendingAttemptListItem {
  attemptId: string
  status: AttemptStatus
  submittedAt: string | null
  attemptNumber: number
  studentName: string
  assessmentId: string
  assessmentTitle: string
  assessmentKind: AssessmentKind
  courseId: string
  courseTitle: string
}

export interface AttemptQuestionForGrading {
  attemptQuestionId: string
  position: number
  type: QuestionType
  prompt: string
  /** Max points for this question (snapshotted at attempt start). */
  points: number
  selectedOptionId: string | null
  textAnswer: string | null
  options: { id: string; label: string }[]
  pointsAwarded: number | null
  isCorrect: boolean | null
  feedback: string | null
  gradedBy: string | null
}

export interface AttemptForGrading {
  attemptId: string
  status: AttemptStatus
  attemptNumber: number
  submittedAt: string | null
  studentName: string
  assessmentId: string
  assessmentTitle: string
  assessmentKind: AssessmentKind
  courseId: string
  courseTitle: string
  autoScore: number
  manualScore: number
  totalScore: number
  maxScore: number
  scorePercent: number | null
  scoreLabel: string | null
  passed: boolean | null
  overallFeedback: string | null
  questions: AttemptQuestionForGrading[]
}

export interface GradeAnswerResult {
  status: AttemptStatus
  totalScore: number
  scorePercent: number | null
  scoreLabel: string | null
}

export interface GradableAssessmentOption {
  id: string
  title: string
  courseId: string
}
