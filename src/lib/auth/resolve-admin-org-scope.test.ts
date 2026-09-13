import { describe, expect, it } from "vitest"
import { resolveAdminOrgScope } from "./resolve-admin-org-scope"
import type { SessionContext } from "./session"

const ORG_A = "11111111-1111-1111-1111-111111111111"
const ORG_B = "22222222-2222-2222-2222-222222222222"

function context(overrides: Partial<SessionContext>): SessionContext {
  return {
    user: { id: "user-1", email: "someone@club-a.test" },
    profile: { firstName: "Test", lastName: "User" },
    organizationId: ORG_A,
    organizationName: "Club A",
    role: "ADMIN",
    isPlatformAdmin: false,
    membershipState: "SINGLE",
    ...overrides,
  }
}

describe("resolveAdminOrgScope (D23)", () => {
  it("refuses an anonymous caller", () => {
    expect(resolveAdminOrgScope(null)).toEqual({ ok: false, code: "UNAUTHENTICATED" })
  })

  it("pins an org admin to their session org when none is requested", () => {
    expect(resolveAdminOrgScope(context({}))).toEqual({ ok: true, organizationId: ORG_A })
  })

  it("allows an org admin to name their own org explicitly", () => {
    expect(resolveAdminOrgScope(context({}), ORG_A)).toEqual({ ok: true, organizationId: ORG_A })
  })

  it("refuses an org admin naming another org — never silently falls back", () => {
    // The dangerous failure mode: returning the session org would make a
    // tampered request look like it succeeded against the attacker's target.
    expect(resolveAdminOrgScope(context({}), ORG_B)).toEqual({ ok: false, code: "FORBIDDEN" })
  })

  it("refuses a professor of the same org", () => {
    expect(resolveAdminOrgScope(context({ role: "PROFESSOR" }), ORG_A)).toEqual({
      ok: false,
      code: "FORBIDDEN",
    })
  })

  it("refuses a student of the same org", () => {
    expect(resolveAdminOrgScope(context({ role: "STUDENT" }))).toEqual({
      ok: false,
      code: "FORBIDDEN",
    })
  })

  it("refuses a signed-in user with no membership at all", () => {
    expect(
      resolveAdminOrgScope(
        context({ role: null, organizationId: null, organizationName: null, membershipState: "NONE" })
      )
    ).toEqual({ ok: false, code: "FORBIDDEN" })
  })

  it("lets a platform admin act on any org they name", () => {
    const platformAdmin = context({
      isPlatformAdmin: true,
      role: null,
      organizationId: null,
      organizationName: null,
      membershipState: "NONE",
    })
    expect(resolveAdminOrgScope(platformAdmin, ORG_B)).toEqual({ ok: true, organizationId: ORG_B })
  })

  it("refuses a platform admin who names no org and has no session org", () => {
    const platformAdmin = context({
      isPlatformAdmin: true,
      role: null,
      organizationId: null,
      organizationName: null,
      membershipState: "NONE",
    })
    expect(resolveAdminOrgScope(platformAdmin)).toEqual({ ok: false, code: "FORBIDDEN" })
  })
})
