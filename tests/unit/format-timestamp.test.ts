import { describe, expect, it } from "vitest"
import { formatTimestamp, parseTimestamp } from "@/features/video-checkpoints/lib/format-timestamp"

describe("formatTimestamp", () => {
  it("formats seconds as m:ss when less than 1 hour", () => {
    expect(formatTimestamp(0)).toBe("0:00")
    expect(formatTimestamp(5)).toBe("0:05")
    expect(formatTimestamp(59)).toBe("0:59")
    expect(formatTimestamp(60)).toBe("1:00")
    expect(formatTimestamp(75)).toBe("1:15")
    expect(formatTimestamp(3599)).toBe("59:59")
  })

  it("formats seconds as h:mm:ss when 1 hour or more", () => {
    expect(formatTimestamp(3600)).toBe("1:00:00")
    expect(formatTimestamp(3605)).toBe("1:00:05")
    expect(formatTimestamp(3665)).toBe("1:01:05")
    expect(formatTimestamp(7200)).toBe("2:00:00")
    expect(formatTimestamp(43200)).toBe("12:00:00")
  })

  it("pads with leading zeros", () => {
    expect(formatTimestamp(61)).toBe("1:01")
    expect(formatTimestamp(3601)).toBe("1:00:01")
  })

  it("handles negative seconds by flooring to 0", () => {
    expect(formatTimestamp(-5)).toBe("0:00")
    expect(formatTimestamp(-100)).toBe("0:00")
  })

  it("handles floats by flooring", () => {
    expect(formatTimestamp(75.9)).toBe("1:15")
    expect(formatTimestamp(75.1)).toBe("1:15")
  })
})

describe("parseTimestamp", () => {
  it("parses m:ss format", () => {
    expect(parseTimestamp("0:00")).toBe(0)
    expect(parseTimestamp("1:00")).toBe(60)
    expect(parseTimestamp("1:15")).toBe(75)
    expect(parseTimestamp("59:59")).toBe(3599)
  })

  it("parses h:mm:ss format", () => {
    expect(parseTimestamp("1:00:00")).toBe(3600)
    expect(parseTimestamp("1:00:05")).toBe(3605)
    expect(parseTimestamp("1:01:05")).toBe(3665)
    expect(parseTimestamp("2:30:45")).toBe(9045)
  })

  it("parses single number as seconds", () => {
    expect(parseTimestamp("0")).toBe(0)
    expect(parseTimestamp("60")).toBe(60)
    expect(parseTimestamp("90")).toBe(90)
  })

  it("trims whitespace", () => {
    expect(parseTimestamp("  1:15  ")).toBe(75)
    expect(parseTimestamp("\t59:59\n")).toBe(3599)
  })

  it("rejects invalid formats", () => {
    expect(parseTimestamp("")).toBeNull()
    expect(parseTimestamp("abc")).toBeNull()
    expect(parseTimestamp("1:2:3:4")).toBeNull()
    expect(parseTimestamp("1:75")).toBeNull()
    expect(parseTimestamp("1:60")).toBeNull()
    expect(parseTimestamp("2:30:75")).toBeNull()
    expect(parseTimestamp("not-a-time")).toBeNull()
  })

  it("rejects partial colons", () => {
    expect(parseTimestamp("1:")).toBeNull()
    expect(parseTimestamp(":30")).toBeNull()
  })

  it("rejects non-digit characters", () => {
    expect(parseTimestamp("1:2a")).toBeNull()
    expect(parseTimestamp("a:00:00")).toBeNull()
  })

  it("round trips format and parse", () => {
    const testCases = [0, 5, 60, 75, 3599, 3600, 3605]
    testCases.forEach((seconds) => {
      const formatted = formatTimestamp(seconds)
      const parsed = parseTimestamp(formatted)
      expect(parsed).toBe(seconds)
    })
  })

  it("handles edge cases in round trip", () => {
    expect(parseTimestamp(formatTimestamp(1))).toBe(1)
    expect(parseTimestamp(formatTimestamp(59))).toBe(59)
    expect(parseTimestamp(formatTimestamp(3599))).toBe(3599)
    expect(parseTimestamp(formatTimestamp(3600))).toBe(3600)
  })

  it("rejects minutes > 59 in seconds position", () => {
    expect(parseTimestamp("1:60:00")).toBeNull()
    expect(parseTimestamp("0:75")).toBeNull()
  })
})
