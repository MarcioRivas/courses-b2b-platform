import type { Database } from "@/types/database.types"

export type AssessmentKind = Database["public"]["Enums"]["assessment_kind"]
export type AssessmentStatus = Database["public"]["Enums"]["assessment_status"]
export type QuestionType = Database["public"]["Enums"]["question_type"]

export interface ExamListItem {
  id: string
  title: string
  status: AssessmentStatus
  availableFrom: string | null
  availableUntil: string | null
  questionCount: number
  randomQuestionCount: number | null
}

export interface EditorQuestionOption {
  label: string
  isCorrect: boolean
}

/** A question as the wizard edits it — options include the answer key (staff-only read). */
export interface EditorQuestion {
  id: string
  type: QuestionType
  prompt: string
  points: number
  options: EditorQuestionOption[]
}

/** Everything the authoring wizard reads for one assessment. */
export interface AssessmentEditorData {
  id: string
  offeringId: string
  kind: AssessmentKind
  status: AssessmentStatus
  title: string
  description: string | null
  passingScore: number | null
  maxAttempts: number | null
  durationSeconds: number | null
  availableFrom: string | null
  availableUntil: string | null
  /** TASK only: the instruction text, the per-submission file limit and late-submission switch. */
  instructions: string | null
  maxFiles: number | null
  allowLateSubmissions: boolean
  randomQuestionCount: number | null
  /** QUIZ/TASK: the owning block's "required" flag. NULL for an EXAM (no block). */
  isRequired: boolean | null
  questions: EditorQuestion[]
}

/** Org-level context the wizard needs to render dates and defaults. */
export interface AssessmentWizardContext {
  timeZone: string
  defaultPassingScore: number
}

/** QUIZ assessments a QUIZ_PASSED module dependency may reference. */
export interface AssessmentPickerOption {
  id: string
  title: string
  status: AssessmentStatus
}
