import { describe, expect, it } from "vitest"
import {
  configToColumns,
  emptyConfigValues,
  type AssessmentConfigColumns,
} from "@/features/assessments/lib/assessment-config-values"
import type { AssessmentConfigInput } from "@/features/assessments/schemas/assessment-schemas"

const TZ = "UTC"

const base: AssessmentConfigInput = {
  kind: "QUIZ",
  title: "Parcial",
  description: "",
  passingScore: "70",
  maxAttempts: "3",
  durationMinutes: "45",
  availableFrom: "2026-10-01T09:00",
  availableUntil: "2026-10-01T11:00",
  maxFiles: "4",
  allowLateSubmissions: true,
}

describe("configToColumns: QUIZ", () => {
  it("ignores attempts, duration, window, files and late submissions (unlimited, untimed, open)", () => {
    const cols: AssessmentConfigColumns = configToColumns(base, TZ)
    expect(cols.max_attempts).toBeNull()
    expect(cols.duration_seconds).toBeNull()
    expect(cols.available_from).toBeNull()
    expect(cols.available_until).toBeNull()
    expect(cols.max_files).toBeNull()
    expect(cols.allow_late_submissions).toBe(false)
  })

  it("keeps the title, passing score, and turns a blank description into NULL", () => {
    const cols = configToColumns(base, TZ)
    expect(cols).toMatchObject({ title: "Parcial", passing_score: 70, description: null })
  })
})

describe("configToColumns: TASK", () => {
  const task: AssessmentConfigInput = {
    ...base,
    kind: "TASK",
    maxAttempts: "5",
    durationMinutes: "30",
    availableFrom: "",
    availableUntil: "2026-10-15T23:59",
    maxFiles: "3",
    allowLateSubmissions: true,
  }

  it("is always one attempt, untimed, with the file limit and a deadline", () => {
    const cols = configToColumns(task, TZ)
    expect(cols.max_attempts).toBe(1)
    expect(cols.duration_seconds).toBeNull()
    expect(cols.max_files).toBe(3)
    expect(cols.available_until).not.toBeNull()
    expect(cols.available_from).toBeNull()
    expect(cols.allow_late_submissions).toBe(true)
  })
})

describe("configToColumns: EXAM", () => {
  const exam: AssessmentConfigInput = {
    ...base,
    kind: "EXAM",
    maxFiles: "9",
    allowLateSubmissions: true,
  }

  it("keeps attempts, duration in seconds and the window; never files or late submissions", () => {
    const cols = configToColumns(exam, TZ)
    expect(cols.max_attempts).toBe(3)
    expect(cols.duration_seconds).toBe(45 * 60)
    expect(cols.available_from).toBe("2026-10-01T09:00:00.000Z")
    expect(cols.available_until).toBe("2026-10-01T11:00:00.000Z")
    expect(cols.max_files).toBeNull()
    expect(cols.allow_late_submissions).toBe(false)
  })

  it("maps blank attempts to unlimited (NULL)", () => {
    expect(configToColumns({ ...exam, maxAttempts: "" }, TZ).max_attempts).toBeNull()
  })
})

describe("emptyConfigValues", () => {
  it("EXAM defaults to one attempt; QUIZ to unlimited; TASK to one file with a future deadline", () => {
    expect(emptyConfigValues("EXAM", 60, TZ).maxAttempts).toBe("1")
    expect(emptyConfigValues("QUIZ", 60, TZ).maxAttempts).toBe("")
    const task = emptyConfigValues("TASK", 60, TZ)
    expect(task.maxFiles).toBe("1")
    expect(task.availableUntil).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
  })

  it("seeds the passing score from the org default", () => {
    expect(emptyConfigValues("QUIZ", 75, TZ).passingScore).toBe("75")
  })
})
