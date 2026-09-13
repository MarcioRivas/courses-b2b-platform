import { describe, expect, it } from "vitest"
import { formatScorePercent, formatScoreSummary } from "@/features/attempts/lib/format-score"

describe("formatScorePercent", () => {
  it("renders an em dash for null (ungraded / max_score=0 guard)", () => {
    expect(formatScorePercent(null)).toBe("—")
  })

  it("renders an em dash for NaN", () => {
    expect(formatScorePercent(Number.NaN)).toBe("—")
  })

  it("rounds to the nearest integer percent", () => {
    expect(formatScorePercent(77.6)).toBe("78%")
    expect(formatScorePercent(77.4)).toBe("77%")
  })

  it("handles the boundaries", () => {
    expect(formatScorePercent(0)).toBe("0%")
    expect(formatScorePercent(100)).toBe("100%")
  })
})

describe("formatScoreSummary", () => {
  it("falls back to just the percent when there is no label (resolve_score_label can return null)", () => {
    expect(formatScoreSummary(85, null)).toBe("85%")
  })

  it("combines percent and label", () => {
    expect(formatScoreSummary(85, "Bueno")).toBe("85% · Bueno")
  })

  it("shows the dash form when percent is null, ignoring any label", () => {
    expect(formatScoreSummary(null, "Bueno")).toBe("—")
  })
})
