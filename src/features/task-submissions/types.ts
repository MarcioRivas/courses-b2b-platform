import type { Database } from "@/types/database.types"

export type AttemptStatus = Database["public"]["Enums"]["attempt_status"]

export interface TaskSubmissionFile {
  id: string
  filename: string
  mimeType: string
  sizeBytes: number
}

export interface MyTaskSubmission {
  attemptId: string
  status: AttemptStatus
  submittedAt: string | null
  submittedLate: boolean
  scorePercent: number | null
  scoreLabel: string | null
  passed: boolean | null
  feedback: string | null
  files: TaskSubmissionFile[]
}

/** The TASK settings a student or grader screen needs, with dates as ISO strings. */
export interface TaskSettings {
  assessmentId: string
  title: string
  instructions: string | null
  maxFiles: number
  availableFrom: string | null
  availableUntil: string
  allowLateSubmissions: boolean
}
