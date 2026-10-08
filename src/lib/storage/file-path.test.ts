import { describe, expect, it } from "vitest"
import { buildCourseFilePath, safeFileName } from "./file-path"

const ORG = "11111111-1111-1111-1111-111111111111"
const COURSE = "22222222-2222-2222-2222-222222222222"
const OFFERING = "33333333-3333-3333-3333-333333333333"

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
  it("puts the organization first, then the course, then the edition", () => {
    const path = buildCourseFilePath({ organizationId: ORG, courseId: COURSE, offeringId: OFFERING, fileName: "a.pdf" })
    const segments = path.split("/")
    expect(segments[0]).toBe(ORG)
    expect(segments[1]).toBe(COURSE)
    expect(segments[2]).toBe(OFFERING)
    expect(segments).toHaveLength(4)
  })

  it("cannot be pushed into another prefix by the file name", () => {
    const path = buildCourseFilePath({
      organizationId: ORG,
      courseId: COURSE,
      offeringId: OFFERING,
      fileName: "../../other-org/evil.pdf",
    })
    expect(path.split("/")).toHaveLength(4)
    expect(path.startsWith(`${ORG}/${COURSE}/${OFFERING}/`)).toBe(true)
  })

  it("gives two uploads of the same name distinct paths", () => {
    const a = buildCourseFilePath({ organizationId: ORG, courseId: COURSE, offeringId: OFFERING, fileName: "a.pdf" })
    const b = buildCourseFilePath({ organizationId: ORG, courseId: COURSE, offeringId: OFFERING, fileName: "a.pdf" })
    expect(a).not.toBe(b)
  })
})
