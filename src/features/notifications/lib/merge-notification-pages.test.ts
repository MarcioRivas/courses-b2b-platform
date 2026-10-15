import { describe, expect, it } from "vitest"
import type { AppNotification } from "../types"
import { mergeFirstPage } from "./merge-notification-pages"

function n(id: string, updatedAt: string): AppNotification {
  return { id, type: "MODULE_OPENED", entityId: id, offeringId: null, payload: {}, readAt: null, updatedAt }
}

const page1 = [n("c", "2026-10-15T12:00:00Z"), n("b", "2026-10-15T11:00:00Z")]

describe("mergeFirstPage", () => {
  it("uses page 1 as-is on first load", () => {
    expect(mergeFirstPage(null, { items: page1, hasMore: true })).toEqual({ items: page1, hasMore: true })
  })

  it("keeps rows loaded with 'Ver más' that are older than page 1", () => {
    const current = { items: [n("b", "2026-10-15T11:00:00Z"), n("a", "2026-10-15T10:00:00Z")], hasMore: false }
    const merged = mergeFirstPage(current, { items: page1, hasMore: true })
    expect(merged.items.map((item) => item.id)).toEqual(["c", "b", "a"])
    expect(merged.hasMore).toBe(false)
  })

  it("drops a row that was bumped into page 1 from the older part", () => {
    const current = { items: [n("b", "2026-10-15T11:00:00Z"), n("x", "2026-10-15T09:00:00Z")], hasMore: true }
    const bumped = [n("x", "2026-10-15T13:00:00Z"), n("b", "2026-10-15T11:00:00Z")]
    expect(mergeFirstPage(current, { items: bumped, hasMore: true }).items.map((item) => item.id)).toEqual(["x", "b"])
  })

  it("replaces the list when page 1 is everything", () => {
    const current = { items: [n("z", "2026-10-15T08:00:00Z")], hasMore: true }
    expect(mergeFirstPage(current, { items: page1, hasMore: false })).toEqual({ items: page1, hasMore: false })
  })
})
