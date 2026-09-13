import { describe, expect, it } from "vitest"
import { contentBlockDataSchema } from "./content-block-schemas"

describe("contentBlockDataSchema", () => {
  it("accepts a valid YOUTUBE_VIDEO block", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "YOUTUBE_VIDEO",
      data: { videoId: "dQw4w9WgXcQ" },
    })
    expect(result.success).toBe(true)
  })

  it("rejects a YOUTUBE_VIDEO block with an invalid id", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "YOUTUBE_VIDEO",
      data: { videoId: "not-an-id" },
    })
    expect(result.success).toBe(false)
  })

  it("accepts a valid RICH_TEXT block", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "RICH_TEXT",
      data: { html: "<p>hola</p>" },
    })
    expect(result.success).toBe(true)
  })

  it("rejects RICH_TEXT with empty html", () => {
    const result = contentBlockDataSchema.safeParse({ type: "RICH_TEXT", data: { html: "" } })
    expect(result.success).toBe(false)
  })

  it("accepts a valid PDF block", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "PDF",
      data: { path: "org/course/uuid-file.pdf", filename: "file.pdf", sizeBytes: 1024 },
    })
    expect(result.success).toBe(true)
  })

  it("rejects a PDF block with a non-positive size", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "PDF",
      data: { path: "org/course/uuid-file.pdf", filename: "file.pdf", sizeBytes: 0 },
    })
    expect(result.success).toBe(false)
  })

  it("accepts a valid IMAGE block without alt", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "IMAGE",
      data: { path: "org/course/uuid-image.png" },
    })
    expect(result.success).toBe(true)
  })

  it("accepts a valid EXTERNAL_LINK block", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "EXTERNAL_LINK",
      data: { url: "https://example.com", title: "Recurso" },
    })
    expect(result.success).toBe(true)
  })

  it("rejects an EXTERNAL_LINK block with an invalid url", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "EXTERNAL_LINK",
      data: { url: "not a url", title: "Recurso" },
    })
    expect(result.success).toBe(false)
  })

  it("rejects a QUIZ/TASK type entirely — not part of the union", () => {
    const result = contentBlockDataSchema.safeParse({ type: "QUIZ", data: {} })
    expect(result.success).toBe(false)
  })

  it("rejects mismatched type/data pairing", () => {
    const result = contentBlockDataSchema.safeParse({
      type: "IMAGE",
      data: { videoId: "dQw4w9WgXcQ" },
    })
    expect(result.success).toBe(false)
  })
})
