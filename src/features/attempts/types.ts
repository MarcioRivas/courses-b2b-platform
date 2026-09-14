import type { Database } from "@/types/database.types"

export type AttemptStatus = Database["public"]["Enums"]["attempt_status"]
export type AssessmentKind = Database["public"]["Enums"]["assessment_kind"]
export type QuestionType = Database["public"]["Enums"]["question_type"]

export interface AttemptHeader {
  attemptId: string
  assessmentId: string
  enrollmentId: string
  status: AttemptStatus
  attemptNumber: number
  startedAt: string
  /** `null` when the assessment has no duration and no window (D12). */
  effectiveEndAt: string | null
  activeSessionId: string | null
  serverNow: string
}

/** Score fields of one attempt, all `null` unless GRADED (`attempt_result`). */
export interface AttemptResultRow {
  scorePercent: number | null
  scoreLabel: string | null
  passed: boolean | null
  overallFeedback: string | null
}

export interface AttemptQuestionOption {
  id: string
  label: string
}

export interface AttemptQuestion {
  attemptQuestionId: string
  position: number
  type: QuestionType
  prompt: string
  options: AttemptQuestionOption[]
  points: number
  selectedOptionId: string | null
  textAnswer: string | null
  clientSeq: number
  /** Non-null only when the attempt is GRADED (D24/F7). */
  pointsAwarded: number | null
  isCorrect: boolean | null
  feedback: string | null
}

export interface AttemptSnapshot {
  header: AttemptHeader
  questions: AttemptQuestion[]
}

/** One row of `list_my_attempts` — feeds the "Evaluaciones" section and the `/learn` strip. */
export interface MyAttemptRow {
  assessmentId: string
  title: string
  kind: AssessmentKind
  availableFrom: string | null
  availableUntil: string | null
  durationSeconds: number | null
  maxAttempts: number | null
  passingScore: number | null
  attemptsUsed: number
  lastAttemptId: string | null
  lastStatus: AttemptStatus | null
  scorePercent: number | null
  scoreLabel: string | null
  passed: boolean | null
  overallFeedback: string | null
}

/** Resync payload shared by `heartbeat`, `save_answers_batch` and `submit_attempt`. */
export interface AttemptSync {
  serverNow: string
  effectiveEndAt: string | null
  status: AttemptStatus
}

export interface HeartbeatResult extends AttemptSync {
  activeSessionId: string | null
  staleSeconds: number
}

export interface AcceptedAnswer {
  attempt_question_id: string
  client_seq: number
}

export interface SaveAnswersResult extends AttemptSync {
  accepted: AcceptedAnswer[]
}

export interface SubmitAttemptResult {
  status: AttemptStatus
  totalScore: number | null
  scorePercent: number | null
  scoreLabel: string | null
}
