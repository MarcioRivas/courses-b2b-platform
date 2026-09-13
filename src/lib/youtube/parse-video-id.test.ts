import { describe, expect, it } from "vitest"
import { parseVideoId } from "./parse-video-id"

const ID = "dQw4w9WgXcQ"

describe("parseVideoId", () => {
  it("accepts a bare id", () => {
    expect(parseVideoId(ID)).toBe(ID)
  })

  it("accepts the standard watch URL, ignoring extra params", () => {
    expect(parseVideoId(`https://www.youtube.com/watch?v=${ID}&t=42s`)).toBe(ID)
  })

  it("accepts a short youtu.be link", () => {
    expect(parseVideoId(`https://youtu.be/${ID}?t=10`)).toBe(ID)
  })

  it("accepts embed, shorts and live paths", () => {
    expect(parseVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
    expect(parseVideoId(`https://youtube.com/shorts/${ID}`)).toBe(ID)
    expect(parseVideoId(`https://youtube.com/live/${ID}`)).toBe(ID)
  })

  it("accepts a URL pasted without a scheme", () => {
    expect(parseVideoId(`youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it("trims surrounding whitespace", () => {
    expect(parseVideoId(`  https://youtu.be/${ID}  `)).toBe(ID)
  })

  it("rejects a non-YouTube host that mimics the watch path", () => {
    expect(parseVideoId(`https://evil.example.com/watch?v=${ID}`)).toBeNull()
  })

  it("rejects a host that merely ends with youtube.com", () => {
    expect(parseVideoId(`https://notyoutube.com/watch?v=${ID}`)).toBeNull()
  })

  it("rejects an id of the wrong length", () => {
    expect(parseVideoId("https://youtu.be/tooshort")).toBeNull()
    expect(parseVideoId("abc")).toBeNull()
  })

  it("rejects empty and garbage input", () => {
    expect(parseVideoId("")).toBeNull()
    expect(parseVideoId("   ")).toBeNull()
    expect(parseVideoId("javascript:alert(1)")).toBeNull()
  })
})
