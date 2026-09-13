import { describe, expect, it } from "vitest"
import { sanitizeHtml } from "./sanitize"

describe("sanitizeHtml — allowed content", () => {
  it("keeps the formatting tags the editor offers", () => {
    const input =
      "<p>Hola <strong>mundo</strong> <em>x</em> <u>y</u></p><h2>T</h2><h3>S</h3><blockquote>c</blockquote><ul><li>a</li></ul><ol><li>b</li></ol>"
    expect(sanitizeHtml(input)).toBe(input)
  })

  it("keeps a safe link and always adds rel", () => {
    expect(sanitizeHtml('<a href="https://example.com">x</a>')).toBe(
      '<a href="https://example.com" rel="noopener noreferrer">x</a>'
    )
  })

  it("allows relative, anchor and mailto hrefs", () => {
    expect(sanitizeHtml('<a href="/docs">d</a>')).toContain('href="/docs"')
    expect(sanitizeHtml('<a href="#top">t</a>')).toContain('href="#top"')
    expect(sanitizeHtml('<a href="mailto:a@b.com">m</a>')).toContain('href="mailto:a@b.com"')
  })

  it("keeps void tags without a closing tag", () => {
    expect(sanitizeHtml("<p>a<br>b</p>")).toBe("<p>a<br>b</p>")
  })
})

describe("sanitizeHtml — script injection", () => {
  it("removes a script element and its payload entirely", () => {
    expect(sanitizeHtml('<p>ok</p><script>alert("xss")</script>')).toBe("<p>ok</p>")
  })

  it("does not leave script text behind when the tag is stripped", () => {
    expect(sanitizeHtml("<script>steal()</script>")).not.toContain("steal")
  })

  it("removes style, iframe, object, embed and template blocks", () => {
    expect(sanitizeHtml("<style>body{}</style><iframe src=x></iframe>")).toBe("")
    expect(sanitizeHtml("<object data=x></object><embed src=x></embed>")).toBe("")
    expect(sanitizeHtml("<template><p>a</p></template>")).toBe("")
  })

  it("strips an unknown tag but keeps its text", () => {
    expect(sanitizeHtml("<div>hola</div>")).toBe("hola")
    expect(sanitizeHtml("<p>a<span>b</span></p>")).toBe("<p>ab</p>")
  })

  it("drops event handler attributes", () => {
    expect(sanitizeHtml('<p onclick="alert(1)">x</p>')).toBe("<p>x</p>")
    expect(sanitizeHtml('<a href="https://a.com" onmouseover="x()">l</a>')).not.toContain("onmouseover")
  })
})

describe("sanitizeHtml — dangerous hrefs", () => {
  it("drops a javascript: href but keeps the link text", () => {
    const result = sanitizeHtml('<a href="javascript:alert(1)">click</a>')
    expect(result).not.toContain("javascript")
    expect(result).toContain("click")
  })

  it("drops a data: href", () => {
    expect(sanitizeHtml('<a href="data:text/html,<script>x</script>">d</a>')).not.toContain("data:")
  })

  it("drops a javascript: href obfuscated with control characters", () => {
    const result = sanitizeHtml('<a href="java\tscript:alert(1)">c</a>')
    expect(result.toLowerCase()).not.toContain("script:")
  })

  it("drops a javascript: href obfuscated with case and spacing", () => {
    expect(sanitizeHtml('<a href="  JaVaScRiPt:alert(1)">c</a>')).not.toContain("alert")
  })
})

describe("sanitizeHtml — malformed input", () => {
  it("escapes stray angle brackets in text", () => {
    expect(sanitizeHtml("5 < 6 and 7 > 2")).toBe("5 &lt; 6 and 7 &gt; 2")
  })

  it("closes tags left unbalanced by the author", () => {
    expect(sanitizeHtml("<p>a")).toBe("<p>a</p>")
  })

  it("ignores a closing tag that was never opened", () => {
    expect(sanitizeHtml("</p>hola")).toBe("hola")
  })

  it("returns an empty string for empty input", () => {
    expect(sanitizeHtml("")).toBe("")
  })

  it("is idempotent — sanitizing twice changes nothing", () => {
    const once = sanitizeHtml('<p>a</p><script>x()</script><a href="https://e.com">l</a>')
    expect(sanitizeHtml(once)).toBe(once)
  })
})
