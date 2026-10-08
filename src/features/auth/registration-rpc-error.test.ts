import { describe, expect, it } from "vitest"
import { mapRegistrationRpcError } from "./registration-rpc-error"

describe("mapRegistrationRpcError", () => {
  it("redirects LINK_EXHAUSTED to /register-required with the exhausted reason", () => {
    expect(mapRegistrationRpcError("LINK_EXHAUSTED")).toEqual({
      kind: "redirect",
      to: "/register-required?reason=link-exhausted",
    })
  })

  it("maps DNI_TAKEN to a CONFLICT form error", () => {
    expect(mapRegistrationRpcError("DNI_TAKEN")).toMatchObject({ kind: "error", code: "CONFLICT" })
  })

  it("maps INVALID_PROFILE to a VALIDATION form error", () => {
    expect(mapRegistrationRpcError("INVALID_PROFILE")).toMatchObject({ kind: "error", code: "VALIDATION" })
  })

  it("returns null for unrelated messages", () => {
    expect(mapRegistrationRpcError("Registration link has expired")).toBeNull()
  })
})
