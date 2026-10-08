/** A checkpoint as the student player sees it: no answer key, options already shuffled by the server. */
export interface StudentCheckpoint {
  id: string
  atSeconds: number
  minCorrect: number
  passed: boolean
  questions: {
    id: string
    prompt: string
    options: { id: string; label: string }[]
  }[]
}

/** Checkpoints of every checkpointed video in a lesson, keyed by block id. */
export type LessonCheckpoints = Record<string, StudentCheckpoint[]>

export interface CheckpointResult {
  passed: boolean
  correct: number
  total: number
  minCorrect: number
}

/** Editor shape. Ids are present for saved items and sent back on save so they keep their history. */
export interface EditorCheckpoint {
  id?: string
  atSeconds: number
  minCorrect: number
  questions: {
    id?: string
    prompt: string
    options: { id?: string; label: string; isCorrect: boolean }[]
  }[]
}

export interface CheckpointQuestionStats {
  id: string
  prompt: string
  answers: number
  wrong: number
  unanswered: number
  options: { id: string; label: string; isCorrect: boolean; chosen: number }[]
}

export interface CheckpointStats {
  id: string
  atSeconds: number
  minCorrect: number
  reached: number
  passed: number
  totalAttempts: number
  failedAttempts: number
  firstTryAttempts: number
  firstTryPassed: number
  avgAttemptsToPass: number | null
  questions: CheckpointQuestionStats[]
}

export interface VideoCheckpointStats {
  enrolledCount: number
  checkpoints: CheckpointStats[]
}
