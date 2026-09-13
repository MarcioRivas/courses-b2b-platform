import { describe, expect, it } from "vitest"
import { learnMessages } from "@/lib/messages/learn"
import { MODULE_STATES, isModuleState, moduleStateLabel } from "./unlock-labels"

describe("moduleStateLabel", () => {
  it("labels every state the RPC can return", () => {
    for (const state of MODULE_STATES) {
      expect(moduleStateLabel(state).label).toBe(learnMessages.states[state])
    }
  })

  it("opens the module only when it is available or already completed", () => {
    expect(moduleStateLabel("AVAILABLE").openable).toBe(true)
    expect(moduleStateLabel("COMPLETED").openable).toBe(true)
    expect(moduleStateLabel("LOCKED_DEPENDENCY").openable).toBe(false)
    expect(moduleStateLabel("UPCOMING").openable).toBe(false)
    expect(moduleStateLabel("EXPIRED").openable).toBe(false)
  })

  it("falls back to the locked presentation for an unknown state", () => {
    // A later migration could add a state before the UI knows it; failing open
    // would show a lesson the server will refuse to record progress for.
    expect(moduleStateLabel("SOMETHING_NEW").openable).toBe(false)
    expect(moduleStateLabel("").openable).toBe(false)
  })

  it("marks EXPIRED as the only destructive tone", () => {
    const destructive = MODULE_STATES.filter((state) => moduleStateLabel(state).tone === "destructive")
    expect(destructive).toEqual(["EXPIRED"])
  })
})

describe("isModuleState", () => {
  it("accepts known states and rejects anything else", () => {
    expect(isModuleState("COMPLETED")).toBe(true)
    expect(isModuleState("completed")).toBe(false)
    expect(isModuleState("QUIZ_PASSED")).toBe(false)
  })
})
