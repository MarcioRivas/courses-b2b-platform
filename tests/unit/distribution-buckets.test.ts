import { describe, expect, it } from "vitest"
import { formatPercent, sortDistributionBuckets } from "@/features/analytics/lib/format-percent"

describe("formatPercent", () => {
  it("appends % to a whole number", () => {
    expect(formatPercent(60)).toBe("60%")
  })

  it("appends % to a decimal without re-rounding", () => {
    expect(formatPercent(66.7)).toBe("66.7%")
  })

  it("formats zero", () => {
    expect(formatPercent(0)).toBe("0%")
  })
})

describe("sortDistributionBuckets", () => {
  it("keeps configured range order and moves Sin rango to the end", () => {
    const input = [
      { label: "Sin rango", count: 2 },
      { label: "Insuficiente", count: 3 },
      { label: "Bueno", count: 5 },
    ]

    expect(sortDistributionBuckets(input).map((b) => b.label)).toEqual([
      "Insuficiente",
      "Bueno",
      "Sin rango",
    ])
  })

  it("is a no-op when there is no unrated bucket", () => {
    const input = [
      { label: "Insuficiente", count: 1 },
      { label: "Bueno", count: 4 },
    ]

    expect(sortDistributionBuckets(input)).toEqual(input)
  })

  it("handles an all-unrated edge case without dropping rows", () => {
    const input = [{ label: "Sin rango", count: 7 }]
    expect(sortDistributionBuckets(input)).toEqual(input)
  })

  it("handles an empty list", () => {
    expect(sortDistributionBuckets([])).toEqual([])
  })
})
