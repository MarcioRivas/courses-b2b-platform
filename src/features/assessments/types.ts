import type { Database } from "@/types/database.types"

export type AssessmentKind = Database["public"]["Enums"]["assessment_kind"]
export type AssessmentStatus = Database["public"]["Enums"]["assessment_status"]

export interface AssessmentListItem {
  id: string
  title: string
  kind: AssessmentKind
  status: AssessmentStatus
  questionCount: number
  randomQuestionCount: number | null
}

export interface AssessmentFixedQuestion {
  id: string
  questionId: string
  position: number
  points: number
  prompt: string
  type: Database["public"]["Enums"]["question_type"]
}

export interface AssessmentDetail {
  id: string
  organizationId: string
  courseId: string
  moduleId: string | null
  kind: AssessmentKind
  status: AssessmentStatus
  title: string
  description: string | null
  questionBankId: string | null
  randomQuestionCount: number | null
  durationSeconds: number | null
  availableFrom: string | null
  availableUntil: string | null
  passingScore: number | null
  maxAttempts: number | null
  /** TASK only: the instruction text, the per-submission file limit and late-submission switch. */
  instructions: string | null
  maxFiles: number | null
  allowLateSubmissions: boolean
  fixedQuestions: AssessmentFixedQuestion[]
}

/** Assessments a QUIZ/TASK content block or a QUIZ_PASSED dependency may reference. */
export interface AssessmentPickerOption {
  id: string
  title: string
  status: AssessmentStatus
}
