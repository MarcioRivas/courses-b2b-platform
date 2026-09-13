import { describe, expect, it } from "vitest"
import { buildCourseFilePath, safeFileName } from "./file-path"

const ORG = "11111111-1111-1111-1111-111111111111"
const COURSE = "22222222-2222-2222-2222-222222222222"

describe("safeFileName", () => {
  it("keeps a normal name", () => {
    expect(safeFileName("apunte-01.pdf")).toBe("apunte-01.pdf")
  })

  it("drops directory components, including traversal attempts", () => {
    expect(safeFileName("../../etc/passwd")).toBe("passwd")
    expect(safeFileName("C:\\Users\\me\\a.pdf")).toBe("a.pdf")
  })

  it("replaces characters that could add a path segment", () => {
    expect(safeFileName("a/b/c.pdf")).toBe("c.pdf")
    expect(safeFileName("we ird (1).png")).toBe("we-ird-1-.png")
  })

  it("never returns an empty name", () => {
    expect(safeFileName("")).toBe("file")
    expect(safeFileName("///")).toBe("file")
  })

  it("caps the length", () => {
    expect(safeFileName(`${"a".repeat(300)}.pdf`).length).toBeLessThanOrEqual(100)
  })
})

describe("buildCourseFilePath", () => {
  it("puts the organization first and the course second", () => {
    const path = buildCourseFilePath({ organizationId: ORG, courseId: COURSE, fileName: "a.pdf" })
    const segments = path.split("/")
    expect(segments[0]).toBe(ORG)
    expect(segments[1]).toBe(COURSE)
    expect(segments).toHaveLength(3)
  })

  it("cannot be pushed into another prefix by the file name", () => {
    const path = buildCourseFilePath({
      organizationId: ORG,
      courseId: COURSE,
      fileName: "../../other-org/evil.pdf",
    })
    expect(path.split("/")).toHaveLength(3)
    expect(path.startsWith(`${ORG}/${COURSE}/`)).toBe(true)
  })

  it("gives two uploads of the same name distinct paths", () => {
    const a = buildCourseFilePath({ organizationId: ORG, courseId: COURSE, fileName: "a.pdf" })
    const b = buildCourseFilePath({ organizationId: ORG, courseId: COURSE, fileName: "a.pdf" })
    expect(a).not.toBe(b)
  })
})
