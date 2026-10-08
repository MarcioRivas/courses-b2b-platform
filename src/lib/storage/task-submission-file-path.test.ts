import { describe, expect, it } from "vitest"
import {
  resolveTaskFileMimeType,
  buildTaskSubmissionPath,
  isPathInsidePrefix,
  taskSubmissionPrefix,
  MAX_TASK_FILE_BYTES,
} from "./task-submission-file-path"

describe("resolveTaskFileMimeType", () => {
  it("accepts PDF files by extension", () => {
    expect(resolveTaskFileMimeType("test.pdf")).toBe("application/pdf")
  })

  it("accepts image types (PNG, JPEG, WebP)", () => {
    expect(resolveTaskFileMimeType("test.png")).toBe("image/png")
    expect(resolveTaskFileMimeType("test.jpg")).toBe("image/jpeg")
    expect(resolveTaskFileMimeType("test.jpeg")).toBe("image/jpeg")
    expect(resolveTaskFileMimeType("test.webp")).toBe("image/webp")
  })

  it("accepts Office file types", () => {
    expect(resolveTaskFileMimeType("document.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    expect(resolveTaskFileMimeType("sheet.xlsx")).toBe(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    expect(resolveTaskFileMimeType("presentation.pptx")).toBe(
      "application/vnd.openxmlformats-officedocument.presentationml.presentation"
    )
  })

  it("handles case-insensitive extensions", () => {
    expect(resolveTaskFileMimeType("DOCUMENT.DOCX")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
    expect(resolveTaskFileMimeType("Image.PNG")).toBe("image/png")
  })

  it("handles files with multiple dots in the name", () => {
    expect(resolveTaskFileMimeType("my.document.final.pdf")).toBe("application/pdf")
    expect(resolveTaskFileMimeType("my.document.final.docx")).toBe(
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )
  })

  it("rejects files with no extension", () => {
    expect(resolveTaskFileMimeType("myfile")).toBeNull()
  })

  it("rejects disallowed file types (e.g., ZIP, EXE)", () => {
    expect(resolveTaskFileMimeType("archive.zip")).toBeNull()
    expect(resolveTaskFileMimeType("executable.exe")).toBeNull()
  })

  it("rejects files with unknown extensions", () => {
    expect(resolveTaskFileMimeType("unknown.xyz")).toBeNull()
  })
})

describe("taskSubmissionPrefix", () => {
  it("builds a prefix from params", () => {
    const params = {
      organizationId: "org-123",
      courseId: "course-456",
      assessmentId: "assessment-789",
      enrollmentId: "enrollment-012",
    }
    const prefix = taskSubmissionPrefix(params)
    expect(prefix).toBe("org-123/course-456/assessment-789/enrollment-012/")
  })

  it("includes trailing slash", () => {
    const prefix = taskSubmissionPrefix({
      organizationId: "org",
      courseId: "course",
      assessmentId: "assessment",
      enrollmentId: "enrollment",
    })
    expect(prefix).toMatch(/\/$/)
  })
})

describe("buildTaskSubmissionPath", () => {
  it("builds a path with UUID and safe filename", () => {
    const params = {
      organizationId: "org-123",
      courseId: "course-456",
      assessmentId: "assessment-789",
      enrollmentId: "enrollment-012",
      fileName: "my-document.pdf",
    }
    const path = buildTaskSubmissionPath(params)
    expect(path).toMatch(/^org-123\/course-456\/assessment-789\/enrollment-012\/[a-f0-9-]{36}-my-document\.pdf$/)
  })

  it("sanitizes filenames with path traversal attempts", () => {
    const params = {
      organizationId: "org",
      courseId: "course",
      assessmentId: "assessment",
      enrollmentId: "enrollment",
      fileName: "../../../etc/passwd.pdf",
    }
    const path = buildTaskSubmissionPath(params)
    expect(path).not.toContain("..")
    expect(path).toMatch(/^org\/course\/assessment\/enrollment\/[a-f0-9-]{36}-/)
  })

  it("stays within the enrollment prefix", () => {
    const params = {
      organizationId: "org",
      courseId: "course",
      assessmentId: "assessment",
      enrollmentId: "enrollment",
      fileName: "test.pdf",
    }
    const path = buildTaskSubmissionPath(params)
    const prefix = taskSubmissionPrefix(params)
    expect(isPathInsidePrefix(path, prefix)).toBe(true)
  })
})

describe("isPathInsidePrefix", () => {
  const prefix = "org/course/assessment/enrollment/"

  it("returns true for paths inside the prefix", () => {
    expect(isPathInsidePrefix("org/course/assessment/enrollment/uuid-file.pdf", prefix)).toBe(true)
  })

  it("returns false for paths outside the prefix", () => {
    expect(isPathInsidePrefix("org/course/assessment/other-enrollment/uuid-file.pdf", prefix)).toBe(false)
  })

  it("returns false for paths with path traversal (..) attempts", () => {
    expect(isPathInsidePrefix("org/course/assessment/enrollment/../../../etc/passwd", prefix)).toBe(false)
    expect(isPathInsidePrefix("org/course/assessment/enrollment/uuid-file.pdf/../etc", prefix)).toBe(false)
  })

  it("returns false for the prefix itself (path must be longer)", () => {
    expect(isPathInsidePrefix("org/course/assessment/enrollment/", prefix)).toBe(false)
  })

  it("returns false for paths that barely miss the prefix", () => {
    expect(isPathInsidePrefix("org/course/assessment/enrollmen/uuid-file.pdf", prefix)).toBe(false)
  })
})

describe("MAX_TASK_FILE_BYTES", () => {
  it("is exactly 20 MB", () => {
    expect(MAX_TASK_FILE_BYTES).toBe(20_971_520)
  })
})
