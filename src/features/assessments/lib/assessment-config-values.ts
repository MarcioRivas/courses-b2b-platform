import type { AssessmentConfigInput } from "../schemas/assessment-schemas"
import type { AssessmentEditorData, AssessmentKind } from "../types"
import { localDateTimeToUtcIso, utcIsoToLocalDateTimeInput } from "./local-datetime"

/** A new TASK needs a deadline from birth (DB check); a week out is a sane default the professor edits. */
const DEFAULT_TASK_DEADLINE_MS = 7 * 24 * 60 * 60 * 1000

/** Step-1 form values for a brand-new assessment of `kind`. */
export function emptyConfigValues(kind: AssessmentKind, defaultPassingScore: number, timeZone: string): AssessmentConfigInput {
  return {
    kind,
    title: "",
    description: "",
    passingScore: String(defaultPassingScore),
    maxAttempts: kind === "EXAM" ? "1" : "",
    durationMinutes: "",
    availableFrom: "",
    availableUntil:
      kind === "TASK"
        ? utcIsoToLocalDateTimeInput(new Date(Date.now() + DEFAULT_TASK_DEADLINE_MS).toISOString(), timeZone)
        : "",
    maxFiles: kind === "TASK" ? "1" : "",
    allowLateSubmissions: false,
  }
}

/** Step-1 form values for an existing assessment. */
export function editorDataToConfigValues(data: AssessmentEditorData, timeZone: string): AssessmentConfigInput {
  return {
    kind: data.kind,
    title: data.title,
    description: data.description ?? "",
    passingScore: String(data.passingScore ?? 60),
    maxAttempts: data.maxAttempts ? String(data.maxAttempts) : "",
    durationMinutes: data.durationSeconds ? String(Math.round(data.durationSeconds / 60)) : "",
    availableFrom: utcIsoToLocalDateTimeInput(data.availableFrom, timeZone),
    availableUntil: utcIsoToLocalDateTimeInput(data.availableUntil, timeZone),
    maxFiles: data.maxFiles ? String(data.maxFiles) : "",
    allowLateSubmissions: data.allowLateSubmissions,
  }
}

export interface AssessmentConfigColumns {
  title: string
  description: string | null
  passing_score: number
  max_attempts: number | null
  duration_seconds: number | null
  available_from: string | null
  available_until: string | null
  max_files: number | null
  allow_late_submissions: boolean
}

/**
 * Validated step-1 values → DB columns. Kind rules are re-applied here no
 * matter what a stale client sent (D25): QUIZ is unlimited/untimed with no
 * window; TASK is one untimed submission with a deadline; EXAM keeps all.
 */
export function configToColumns(config: AssessmentConfigInput, timeZone: string): AssessmentConfigColumns {
  const { kind } = config
  const toUtc = (value: string | undefined) => (kind === "QUIZ" || !value ? null : localDateTimeToUtcIso(value, timeZone))

  return {
    title: config.title,
    description: config.description || null,
    passing_score: Number(config.passingScore),
    max_attempts: kind === "QUIZ" ? null : kind === "TASK" ? 1 : config.maxAttempts ? Number(config.maxAttempts) : null,
    duration_seconds: kind === "EXAM" && config.durationMinutes ? Number(config.durationMinutes) * 60 : null,
    available_from: toUtc(config.availableFrom),
    available_until: toUtc(config.availableUntil),
    max_files: kind === "TASK" ? Number(config.maxFiles) : null,
    allow_late_submissions: kind === "TASK" ? config.allowLateSubmissions : false,
  }
}
