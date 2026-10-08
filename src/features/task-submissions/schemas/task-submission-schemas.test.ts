import { describe, expect, it } from "vitest"
import {
  prepareTaskUploadSchema,
  submitTaskSchema,
  discardTaskUploadsSchema,
  gradeTaskSchema,
  taskFileUrlSchema,
} from "./task-submission-schemas"
import { MAX_TASK_FILE_BYTES } from "@/lib/storage/task-submission-file-path"

const VALID_UUID = "11111111-1111-4111-8111-111111111111"

describe("prepareTaskUploadSchema", () => {
  const baseInput = {
    assessmentId: VALID_UUID,
    enrollmentId: VALID_UUID,
  }

  it("accepts one file under size limit", () => {
    const result = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: [{ name: "document.pdf", size: 1_000_000, type: "application/pdf" }],
    })
    expect(result.success).toBe(true)
  })

  it("accepts up to 10 files", () => {
    const result = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: Array.from({ length: 10 }, (_, i) => ({
        name: `file${i}.pdf`,
        size: 1_000_000,
        type: "application/pdf",
      })),
    })
    expect(result.success).toBe(true)
  })

  it("rejects more than 10 files", () => {
    const result = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: Array.from({ length: 11 }, (_, i) => ({
        name: `file${i}.pdf`,
        size: 1_000_000,
        type: "application/pdf",
      })),
    })
    expect(result.success).toBe(false)
  })

  it("rejects files over the size limit", () => {
    const result = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: [{ name: "large.pdf", size: MAX_TASK_FILE_BYTES + 1, type: "application/pdf" }],
    })
    expect(result.success).toBe(false)
  })

  it("accepts files at exactly the size limit", () => {
    const result = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: [{ name: "large.pdf", size: MAX_TASK_FILE_BYTES, type: "application/pdf" }],
    })
    expect(result.success).toBe(true)
  })

  it("rejects zero files", () => {
    const result = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty file name", () => {
    const result = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: [{ name: "", size: 1_000, type: "application/pdf" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects negative or zero file size", () => {
    const result1 = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: [{ name: "file.pdf", size: 0, type: "application/pdf" }],
    })
    const result2 = prepareTaskUploadSchema.safeParse({
      ...baseInput,
      files: [{ name: "file.pdf", size: -1000, type: "application/pdf" }],
    })
    expect(result1.success).toBe(false)
    expect(result2.success).toBe(false)
  })
})

describe("submitTaskSchema", () => {
  const baseInput = {
    assessmentId: VALID_UUID,
    enrollmentId: VALID_UUID,
  }

  it("accepts one submitted file", () => {
    const result = submitTaskSchema.safeParse({
      ...baseInput,
      files: [{ path: "org/course/assessment/enrollment/uuid-file.pdf", filename: "file.pdf" }],
    })
    expect(result.success).toBe(true)
  })

  it("accepts up to 10 files", () => {
    const result = submitTaskSchema.safeParse({
      ...baseInput,
      files: Array.from({ length: 10 }, (_, i) => ({
        path: `org/course/assessment/enrollment/uuid${i}-file.pdf`,
        filename: `file${i}.pdf`,
      })),
    })
    expect(result.success).toBe(true)
  })

  it("rejects zero files", () => {
    const result = submitTaskSchema.safeParse({
      ...baseInput,
      files: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects more than 10 files", () => {
    const result = submitTaskSchema.safeParse({
      ...baseInput,
      files: Array.from({ length: 11 }, (_, i) => ({
        path: `org/course/assessment/enrollment/uuid${i}-file.pdf`,
        filename: `file${i}.pdf`,
      })),
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty path", () => {
    const result = submitTaskSchema.safeParse({
      ...baseInput,
      files: [{ path: "", filename: "file.pdf" }],
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty filename", () => {
    const result = submitTaskSchema.safeParse({
      ...baseInput,
      files: [{ path: "org/course/assessment/enrollment/uuid-file.pdf", filename: "" }],
    })
    expect(result.success).toBe(false)
  })
})

describe("discardTaskUploadsSchema", () => {
  const baseInput = {
    assessmentId: VALID_UUID,
    enrollmentId: VALID_UUID,
  }

  it("accepts one path to discard", () => {
    const result = discardTaskUploadsSchema.safeParse({
      ...baseInput,
      paths: ["org/course/assessment/enrollment/uuid-file.pdf"],
    })
    expect(result.success).toBe(true)
  })

  it("accepts up to 10 paths", () => {
    const result = discardTaskUploadsSchema.safeParse({
      ...baseInput,
      paths: Array.from({ length: 10 }, (_, i) => `org/course/assessment/enrollment/uuid${i}-file.pdf`),
    })
    expect(result.success).toBe(true)
  })

  it("rejects zero paths", () => {
    const result = discardTaskUploadsSchema.safeParse({
      ...baseInput,
      paths: [],
    })
    expect(result.success).toBe(false)
  })

  it("rejects more than 10 paths", () => {
    const result = discardTaskUploadsSchema.safeParse({
      ...baseInput,
      paths: Array.from({ length: 11 }, (_, i) => `org/course/assessment/enrollment/uuid${i}-file.pdf`),
    })
    expect(result.success).toBe(false)
  })

  it("rejects empty path", () => {
    const result = discardTaskUploadsSchema.safeParse({
      ...baseInput,
      paths: [""],
    })
    expect(result.success).toBe(false)
  })
})

describe("gradeTaskSchema", () => {
  const baseInput = {
    attemptId: VALID_UUID,
    submittedAt: "2026-10-15T10:30:00Z",
  }

  it("accepts valid score 0-100", () => {
    expect(gradeTaskSchema.safeParse({ ...baseInput, score: "0" }).success).toBe(true)
    expect(gradeTaskSchema.safeParse({ ...baseInput, score: "50" }).success).toBe(true)
    expect(gradeTaskSchema.safeParse({ ...baseInput, score: "100" }).success).toBe(true)
  })

  it("rejects score > 100", () => {
    const result = gradeTaskSchema.safeParse({ ...baseInput, score: "101" })
    expect(result.success).toBe(false)
  })

  it("rejects non-numeric score", () => {
    const result = gradeTaskSchema.safeParse({ ...baseInput, score: "abc" })
    expect(result.success).toBe(false)
  })

  it("rejects negative score", () => {
    const result = gradeTaskSchema.safeParse({ ...baseInput, score: "-1" })
    expect(result.success).toBe(false)
  })

  it("accepts optional feedback", () => {
    const result = gradeTaskSchema.safeParse({
      ...baseInput,
      score: "85",
      feedback: "Good work, but needs improvement in section 2.",
    })
    expect(result.success).toBe(true)
  })

  it("accepts empty feedback", () => {
    const result = gradeTaskSchema.safeParse({ ...baseInput, score: "85", feedback: "" })
    expect(result.success).toBe(true)
  })

  it("rejects feedback over 5000 characters", () => {
    const result = gradeTaskSchema.safeParse({
      ...baseInput,
      score: "85",
      feedback: "a".repeat(5001),
    })
    expect(result.success).toBe(false)
  })

  it("accepts feedback at exactly 5000 characters", () => {
    const result = gradeTaskSchema.safeParse({
      ...baseInput,
      score: "85",
      feedback: "a".repeat(5000),
    })
    expect(result.success).toBe(true)
  })

  it("accepts null submittedAt", () => {
    const result = gradeTaskSchema.safeParse({
      attemptId: VALID_UUID,
      submittedAt: null,
      score: "85",
    })
    expect(result.success).toBe(true)
  })

  it("trims whitespace from feedback", () => {
    const result = gradeTaskSchema.safeParse({
      ...baseInput,
      score: "85",
      feedback: "   Good work   ",
    })
    if (result.success) {
      expect(result.data.feedback).toBe("Good work")
    } else {
      throw new Error("Expected validation to succeed")
    }
  })
})

describe("taskFileUrlSchema", () => {
  it("accepts valid file id", () => {
    const result = taskFileUrlSchema.safeParse({
      fileId: VALID_UUID,
    })
    expect(result.success).toBe(true)
  })

  it("rejects invalid UUID", () => {
    const result = taskFileUrlSchema.safeParse({
      fileId: "not-a-uuid",
    })
    expect(result.success).toBe(false)
  })
})
