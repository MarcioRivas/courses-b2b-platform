import { describe, expect, it } from "vitest"
import { wouldCreateDependencyCycle } from "./detect-dependency-cycle"

describe("wouldCreateDependencyCycle", () => {
  it("rejects a direct self-dependency", () => {
    expect(wouldCreateDependencyCycle([], { moduleId: "a", dependsOnModuleId: "a" })).toBe(true)
  })

  it("allows a first dependency with no existing edges", () => {
    expect(wouldCreateDependencyCycle([], { moduleId: "a", dependsOnModuleId: "b" })).toBe(false)
  })

  it("allows a diamond (A→B, A→C, B→D, C→D)", () => {
    const edges = [
      { moduleId: "a", dependsOnModuleId: "b" },
      { moduleId: "a", dependsOnModuleId: "c" },
      { moduleId: "b", dependsOnModuleId: "d" },
    ]
    expect(wouldCreateDependencyCycle(edges, { moduleId: "c", dependsOnModuleId: "d" })).toBe(false)
  })

  it("detects a direct 2-cycle (B already depends on A, now adding A depends on B)", () => {
    const edges = [{ moduleId: "b", dependsOnModuleId: "a" }]
    expect(wouldCreateDependencyCycle(edges, { moduleId: "a", dependsOnModuleId: "b" })).toBe(true)
  })

  it("detects a transitive 3-cycle (A→B→C, now adding C→A)", () => {
    const edges = [
      { moduleId: "a", dependsOnModuleId: "b" },
      { moduleId: "b", dependsOnModuleId: "c" },
    ]
    expect(wouldCreateDependencyCycle(edges, { moduleId: "c", dependsOnModuleId: "a" })).toBe(true)
  })

  it("does not flag unrelated existing edges", () => {
    const edges = [{ moduleId: "x", dependsOnModuleId: "y" }]
    expect(wouldCreateDependencyCycle(edges, { moduleId: "a", dependsOnModuleId: "b" })).toBe(false)
  })
})
