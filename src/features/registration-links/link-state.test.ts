import { describe, expect, it, vi } from "vitest"
import { linkState } from "./link-state"

describe("linkState", () => {
  it("is REVOKED when revokedAt is set, regardless of everything else", () => {
    expect(
      linkState({ isActive: true, revokedAt: "2020-01-01T00:00:00Z", expiresAt: "2099-01-01T00:00:00Z" })
    ).toBe("REVOKED")
    expect(
      linkState({ isActive: false, revokedAt: "2020-01-01T00:00:00Z", expiresAt: "2000-01-01T00:00:00Z" })
    ).toBe("REVOKED")
  })

  it("is EXPIRED when past expiresAt, before checking isActive", () => {
    expect(linkState({ isActive: true, revokedAt: null, expiresAt: "2000-01-01T00:00:00Z" })).toBe("EXPIRED")
    expect(linkState({ isActive: false, revokedAt: null, expiresAt: "2000-01-01T00:00:00Z" })).toBe("EXPIRED")
  })

  it("is INACTIVE when not active, not expired, not revoked", () => {
    expect(linkState({ isActive: false, revokedAt: null, expiresAt: "2099-01-01T00:00:00Z" })).toBe("INACTIVE")
  })

  it("is INACTIVE when not active and there is no expiry at all", () => {
    expect(linkState({ isActive: false, revokedAt: null, expiresAt: null })).toBe("INACTIVE")
  })

  it("is ACTIVE when active, not expired, not revoked", () => {
    expect(linkState({ isActive: true, revokedAt: null, expiresAt: "2099-01-01T00:00:00Z" })).toBe("ACTIVE")
  })

  it("is ACTIVE when active and expiresAt is null (no expiry)", () => {
    expect(linkState({ isActive: true, revokedAt: null, expiresAt: null })).toBe("ACTIVE")
  })

  it("treats expiresAt exactly equal to now as EXPIRED (boundary)", () => {
    vi.useFakeTimers()
    try {
      const now = new Date("2026-01-01T12:00:00.000Z")
      vi.setSystemTime(now)
      expect(linkState({ isActive: true, revokedAt: null, expiresAt: now.toISOString() })).toBe("EXPIRED")
    } finally {
      vi.useRealTimers()
    }
  })
})
